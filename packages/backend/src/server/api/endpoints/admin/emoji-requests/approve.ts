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
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { DriveService } from '@/core/DriveService.js';
import { EmailService } from '@/core/EmailService.js';
import { EmailI18nService } from '@/core/EmailI18nService.js';
import { FILE_TYPE_IMAGE } from '@/const.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:emoji-requests-approve',

	errors: {
		noSuchRequest: {
			message: 'No such emoji request.',
			code: 'NO_SUCH_REQUEST',
			id: '70aa6e51-e010-4ecf-8196-9110318934b5',
		},
		alreadyReviewed: {
			message: 'This emoji request has already been reviewed.',
			code: 'ALREADY_REVIEWED',
			id: '04175ccd-6d85-45c2-8692-6e8c0fa7dec4',
		},
		noSuchFile: {
			message: 'The attached file no longer exists.',
			code: 'NO_SUCH_FILE',
			id: 'e8d61214-e75d-439e-9465-aa0930d9ee0b',
		},
		unsupportedFileType: {
			message: 'Unsupported file type.',
			code: 'UNSUPPORTED_FILE_TYPE',
			id: '1aacbd75-25f4-4efc-99bd-093b4f994c73',
		},
		duplicateName: {
			message: 'An emoji with this name already exists.',
			code: 'DUPLICATE_NAME',
			id: '0c9df859-d222-46df-a548-f24997667eac',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		requestId: { type: 'string', format: 'misskey:id' },
	},
	required: ['requestId'],
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
		private customEmojiService: CustomEmojiService,
		private driveService: DriveService,
		private emailService: EmailService,
		private emailI18nService: EmailI18nService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const request = await this.emojiRequestsRepository.findOneBy({ id: ps.requestId });
			if (request == null) throw new ApiError(meta.errors.noSuchRequest);
			if (request.status !== 'pending') throw new ApiError(meta.errors.alreadyReviewed);

			const driveFile = request.fileId == null ? null : await this.driveFilesRepository.findOneBy({ id: request.fileId });
			if (driveFile == null) throw new ApiError(meta.errors.noSuchFile);
			if (!FILE_TYPE_IMAGE.includes(driveFile.type)) throw new ApiError(meta.errors.unsupportedFileType);

			const isDuplicate = await this.customEmojiService.checkDuplicate(request.name);
			if (isDuplicate) throw new ApiError(meta.errors.duplicateName);

			const requester = await this.usersRepository.findOneByOrFail({ id: request.userId });

			const emoji = await this.customEmojiService.add({
				originalUrl: driveFile.url,
				publicUrl: driveFile.webpublicUrl ?? driveFile.url,
				fileType: driveFile.webpublicType ?? driveFile.type,
				name: request.name,
				category: request.category,
				aliases: [],
				host: null,
				license: request.license,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			}, me);

			await this.emojiRequestsRepository.update(request.id, {
				status: 'approved',
				reviewerId: me.id,
				reviewedAt: new Date(),
				resultEmojiId: emoji.id,
			});

			this.moderationLogService.log(me, 'approveEmojiRequest', {
				requestId: request.id,
				requesterId: requester.id,
				requesterUsername: requester.username,
				requesterHost: requester.host,
				emojiId: emoji.id,
				emojiName: emoji.name,
			});

			if (request.deleteFileAfterReview) {
				this.driveService.deleteFile(driveFile, false, me);
			}

			const profile = await this.userProfilesRepository.findOneBy({ userId: request.userId });
			if (profile?.email != null) {
				const lang = await this.emailI18nService.resolveLang(profile.emailLang);
				const i18n = this.emailI18nService.getI18n(lang);
				this.emailService.sendEmail(profile.email, i18n.t('_email.emojiRequestApproved.subject', { name: request.name }),
					i18n.t('_email.emojiRequestApproved.html', { name: request.name }),
					i18n.t('_email.emojiRequestApproved.text', { name: request.name }));
			}
		});
	}
}
