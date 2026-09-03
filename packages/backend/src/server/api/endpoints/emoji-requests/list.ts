/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { EmojiRequestsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { IdService } from '@/core/IdService.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveEmojiRequestSettings } from '@/models/JuiceSettings.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['emoji-requests'],

	requireCredential: true,
	kind: 'read:emoji-requests',

	errors: {
		functionDisabled: {
			message: 'The emoji request feature is currently disabled.',
			code: 'FUNCTION_DISABLED',
			id: '7e7d2063-c6ff-434d-b60b-3a5e562f9408',
		},
	},

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'EmojiRequestEntry',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.emojiRequestsRepository)
		private emojiRequestsRepository: EmojiRequestsRepository,

		private queryService: QueryService,
		private idService: IdService,
		private juiceSettingsService: JuiceSettingsService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const { emojiRequestEnabled } = resolveEmojiRequestSettings(await this.juiceSettingsService.fetch());
			if (!emojiRequestEnabled) throw new ApiError(meta.errors.functionDisabled);

			const query = this.queryService.makePaginationQuery(this.emojiRequestsRepository.createQueryBuilder('request'), ps.sinceId, ps.untilId)
				.andWhere('request.userId = :userId', { userId: me.id })
				.leftJoinAndSelect('request.file', 'file');

			const requests = await query.limit(ps.limit).getMany();

			return requests.map(request => ({
				id: request.id,
				createdAt: this.idService.parse(request.id).date.toISOString(),
				fileId: request.fileId,
				// JUICE: 一覧でサムネイル表示に使う
				fileUrl: request.file?.url ?? null,
				name: request.name,
				category: request.category,
				aliases: request.aliases,
				license: request.license,
				isSensitive: request.isSensitive,
				localOnly: request.localOnly,
				status: request.status,
				rejectReason: request.rejectReason,
				reviewedAt: request.reviewedAt?.toISOString() ?? null,
				resultEmojiId: request.resultEmojiId,
			}));
		});
	}
}
