/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AvatarDecorationRequestsRepository, DriveFilesRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { AvatarDecorationService } from '@/core/AvatarDecorationService.js';
import { DriveService } from '@/core/DriveService.js';
import { EmailService } from '@/core/EmailService.js';
import { EmailI18nService } from '@/core/EmailI18nService.js';
import { FILE_TYPE_IMAGE } from '@/const.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	// JUICE: モデレーター/管理者、またはcanApproveAvatarDecorationRequestsロールポリシーを持つユーザーのみ許可
	requiredRolePolicyOrModerator: 'canApproveAvatarDecorationRequests',
	kind: 'write:admin:avatar-decoration-requests-approve',

	errors: {
		noSuchRequest: {
			message: 'No such avatar decoration request.',
			code: 'NO_SUCH_REQUEST',
			id: '1ba00992-c405-4dea-b9ae-2872bcc656db',
		},
		alreadyReviewed: {
			message: 'This avatar decoration request has already been reviewed.',
			code: 'ALREADY_REVIEWED',
			id: '4699dbd2-11cf-48be-b7e2-d6738ab490d0',
		},
		noSuchFile: {
			message: 'The attached file no longer exists.',
			code: 'NO_SUCH_FILE',
			id: 'c20e1914-c2d5-41ee-9a3a-d95daf4431cd',
		},
		unsupportedFileType: {
			message: 'Unsupported file type.',
			code: 'UNSUPPORTED_FILE_TYPE',
			id: 'd5e57192-b37a-4b4a-b438-65e874e3bb2a',
		},
		fileCopyFailed: {
			message: 'Failed to copy the attached file.',
			code: 'FILE_COPY_FAILED',
			id: '53f9329a-3da2-45fe-9e22-8319076d4c70',
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
		@Inject(DI.avatarDecorationRequestsRepository)
		private avatarDecorationRequestsRepository: AvatarDecorationRequestsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private moderationLogService: ModerationLogService,
		private avatarDecorationService: AvatarDecorationService,
		private driveService: DriveService,
		private emailService: EmailService,
		private emailI18nService: EmailI18nService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const request = await this.avatarDecorationRequestsRepository.findOneBy({ id: ps.requestId });
			if (request == null) throw new ApiError(meta.errors.noSuchRequest);
			if (request.status !== 'pending') throw new ApiError(meta.errors.alreadyReviewed);

			const driveFile = request.fileId == null ? null : await this.driveFilesRepository.findOneBy({ id: request.fileId });
			if (driveFile == null) throw new ApiError(meta.errors.noSuchFile);
			if (!FILE_TYPE_IMAGE.includes(driveFile.type)) throw new ApiError(meta.errors.unsupportedFileType);

			const requester = await this.usersRepository.findOneByOrFail({ id: request.userId });

			// システム所有の複製を登録(申請者ファイル削除の影響回避。admin/emoji-requests/approveと同じ方式)
			let decorationFile: MiDriveFile;
			try {
				decorationFile = await this.driveService.uploadFromUrl({ url: driveFile.url, user: null, force: true, sensitive: driveFile.isSensitive });
			} catch {
				throw new ApiError(meta.errors.fileCopyFailed);
			}

			const decoration = await this.avatarDecorationService.create({
				name: request.name,
				description: request.description,
				url: decorationFile.url,
				roleIdsThatCanBeUsedThisDecoration: [],
				category: request.category,
			}, me);

			await this.avatarDecorationRequestsRepository.update(request.id, {
				status: 'approved',
				reviewerId: me.id,
				reviewedAt: new Date(),
				resultAvatarDecorationId: decoration.id,
			});

			this.moderationLogService.log(me, 'approveAvatarDecorationRequest', {
				requestId: request.id,
				requesterId: requester.id,
				requesterUsername: requester.username,
				requesterHost: requester.host,
				avatarDecorationId: decoration.id,
				avatarDecorationName: decoration.name,
			});

			if (request.deleteFileAfterReview) {
				this.driveService.deleteFile(driveFile, false, me);
			}

			const profile = await this.userProfilesRepository.findOneBy({ userId: request.userId });
			if (profile?.email != null && profile.emailVerified && profile.receiveAvatarDecorationRequestResultEmail) {
				const lang = await this.emailI18nService.resolveLang(profile.emailLang);
				const i18n = this.emailI18nService.getI18n(lang);
				this.emailService.sendEmail(profile.email, i18n.t('_email.avatarDecorationRequestApproved.subject', { name: request.name }),
					i18n.t('_email.avatarDecorationRequestApproved.html', { name: request.name }),
					i18n.t('_email.avatarDecorationRequestApproved.text', { name: request.name }));
			}
		});
	}
}
