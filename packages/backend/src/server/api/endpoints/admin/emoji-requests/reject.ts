/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { EmojiRequestsRepository, DriveFilesRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { DriveService } from '@/core/DriveService.js';
import { EmailService } from '@/core/EmailService.js';
import { EmailI18nService } from '@/core/EmailI18nService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	// JUICE: モデレーター/管理者、またはcanApproveEmojiRequestsロールポリシーを持つユーザーのみ許可
	requiredRolePolicyOrModerator: 'canApproveEmojiRequests',
	kind: 'write:admin:emoji-requests-reject',

	errors: {
		noSuchRequest: {
			message: 'No such emoji request.',
			code: 'NO_SUCH_REQUEST',
			id: '0e67ba91-fe02-4dd9-a2c9-c17771f6774b',
		},
		alreadyReviewed: {
			message: 'This emoji request has already been reviewed.',
			code: 'ALREADY_REVIEWED',
			id: '98c4be7c-e74a-4dcb-907b-80599fa7698a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		requestId: { type: 'string', format: 'misskey:id' },
		reason: { type: 'string', maxLength: 1024 },
	},
	required: ['requestId', 'reason'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.emojiRequestsRepository)
		private emojiRequestsRepository: EmojiRequestsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private moderationLogService: ModerationLogService,
		private driveService: DriveService,
		private emailService: EmailService,
		private emailI18nService: EmailI18nService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const request = await this.emojiRequestsRepository.findOneBy({ id: ps.requestId });
			if (request == null) throw new ApiError(meta.errors.noSuchRequest);
			if (request.status !== 'pending') throw new ApiError(meta.errors.alreadyReviewed);

			const requester = await this.usersRepository.findOneByOrFail({ id: request.userId });

			await this.emojiRequestsRepository.update(request.id, {
				status: 'rejected',
				reviewerId: me.id,
				reviewedAt: new Date(),
				rejectReason: ps.reason,
			});

			this.moderationLogService.log(me, 'rejectEmojiRequest', {
				requestId: request.id,
				requesterId: requester.id,
				requesterUsername: requester.username,
				requesterHost: requester.host,
				requestedName: request.name,
				reason: ps.reason,
			});

			if (request.deleteFileAfterReview && request.fileId != null) {
				const driveFile = await this.driveFilesRepository.findOneBy({ id: request.fileId });
				if (driveFile != null) {
					this.driveService.deleteFile(driveFile, false, me);
				}
			}

			const profile = await this.userProfilesRepository.findOneBy({ userId: request.userId });
			if (profile?.email != null && profile.emailVerified && profile.receiveEmojiRequestResultEmail) {
				const lang = await this.emailI18nService.resolveLang(profile.emailLang);
				const i18n = this.emailI18nService.getI18n(lang);
				this.emailService.sendEmail(profile.email, i18n.t('_email.emojiRequestRejected.subject', { name: request.name }),
					i18n.t('_email.emojiRequestRejected.html', { name: request.name, reason: ps.reason }),
					i18n.t('_email.emojiRequestRejected.text', { name: request.name, reason: ps.reason }));
			}
		});
	}
}
