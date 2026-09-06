/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { AnnouncementPollsRepository, AnnouncementPollVotesRepository, MiAnnouncement, MiAnnouncementPoll, MiUser } from '@/models/_.js';
import { MiAnnouncementPollVote } from '@/models/AnnouncementPollVote.js';
import type { IAnnouncementPoll } from '@/models/AnnouncementPoll.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class AnnouncementPollService {
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.announcementPollsRepository)
		private announcementPollsRepository: AnnouncementPollsRepository,

		@Inject(DI.announcementPollVotesRepository)
		private announcementPollVotesRepository: AnnouncementPollVotesRepository,

		private idService: IdService,
		private globalEventService: GlobalEventService,
	) {
	}

	/**
	 * お知らせ作成時にのみ呼ばれる。作成後の投票内容の変更は許可しない
	 * (投票済みの `AnnouncementPollVote.choice` と `choices`/`votes` 配列のインデックス対応が崩れるため)。
	 */
	@bindThis
	public async create(announcementId: MiAnnouncement['id'], poll: IAnnouncementPoll): Promise<MiAnnouncementPoll> {
		const record: MiAnnouncementPoll = {
			announcementId,
			announcement: null,
			expiresAt: poll.expiresAt,
			multiple: poll.multiple,
			choices: poll.choices,
			votes: poll.choices.map(() => 0),
		};

		await this.announcementPollsRepository.insert(record);

		return record;
	}

	@bindThis
	public async vote(user: { id: MiUser['id'] }, announcement: MiAnnouncement, choice: number): Promise<void> {
		const poll = await this.announcementPollsRepository.findOneBy({ announcementId: announcement.id });
		if (poll == null) {
			throw new IdentifiableError('02ebd85f-1ce2-4afc-a5bc-b7559ef37ddd', 'This announcement does not have a poll.');
		}

		if (poll.expiresAt != null && poll.expiresAt < new Date()) {
			throw new IdentifiableError('34b96600-a1d0-4157-a4dd-df82f5c7b971', 'The poll is already expired.');
		}

		if (poll.choices[choice] == null) {
			throw new IdentifiableError('82a4344d-0c50-4a7b-bad2-1accc93a9307', 'Choice ID is invalid.');
		}

		// JUICE: 「既に投票済みか」チェックとINSERTを、ユーザー×お知らせ単位のadvisory lockで
		// 直列化した上で同一トランザクション内で行う。そうしないと同時リクエストでこのチェックが
		// 競合し、単一選択ポール(multiple: false)でも複数の選択肢に投票できてしまう(TOCTOU)
		await this.db.transaction(async em => {
			await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${user.id}:${announcement.id}`]);

			const exist = await em.findBy(MiAnnouncementPollVote, {
				announcementId: announcement.id,
				userId: user.id,
			});

			if (poll.multiple) {
				if (exist.some(x => x.choice === choice)) {
					throw new IdentifiableError('0ac3fb2f-30f2-4642-b2ed-e57e0790679d', 'You have already voted.');
				}
			} else if (exist.length !== 0) {
				throw new IdentifiableError('0ac3fb2f-30f2-4642-b2ed-e57e0790679d', 'You have already voted.');
			}

			await em.insert(MiAnnouncementPollVote, {
				id: this.idService.gen(),
				announcementId: announcement.id,
				userId: user.id,
				choice,
			});

			// Increment votes count
			const index = choice + 1; // In SQL, array index is 1 based
			await em.query(`UPDATE announcement_poll SET votes[${index}] = votes[${index}] + 1 WHERE "announcementId" = $1`, [poll.announcementId]);
		});

		this.globalEventService.publishBroadcastStream('announcementPollVoted', {
			announcementId: announcement.id,
			choice,
			userId: user.id,
		});
	}

	/**
	 * お知らせIDごとの投票情報を返す(存在しない場合はMapに含まれない)。
	 */
	@bindThis
	public async getPolls(announcementIds: MiAnnouncement['id'][]): Promise<Map<MiAnnouncement['id'], MiAnnouncementPoll>> {
		const result = new Map<MiAnnouncement['id'], MiAnnouncementPoll>();
		if (announcementIds.length === 0) return result;

		const polls = await this.announcementPollsRepository.findBy({
			announcementId: In(announcementIds),
		});

		for (const poll of polls) {
			result.set(poll.announcementId, poll);
		}

		return result;
	}

	/**
	 * 指定ユーザーが各お知らせに投じた投票を返す。
	 */
	@bindThis
	public async getMyVotes(announcementIds: MiAnnouncement['id'][], meId: MiUser['id']): Promise<Map<MiAnnouncement['id'], MiAnnouncementPollVote[]>> {
		const result = new Map<MiAnnouncement['id'], MiAnnouncementPollVote[]>();
		if (announcementIds.length === 0) return result;

		const votes = await this.announcementPollVotesRepository.findBy({
			userId: meId,
			announcementId: In(announcementIds),
		});

		for (const vote of votes) {
			const list = result.get(vote.announcementId) ?? [];
			list.push(vote);
			result.set(vote.announcementId, list);
		}

		return result;
	}
}
