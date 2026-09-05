/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AvatarDecorationRequestsRepository, AvatarDecorationsRepository, DriveFilesRepository, MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveAvatarDecorationRequestSettings } from '@/models/JuiceSettings.js';
import { CaptchaService } from '@/core/CaptchaService.js';
import { JuiceAdminNotificationService } from '@/core/JuiceAdminNotificationService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { FILE_TYPE_IMAGE } from '@/const.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['avatar-decoration-requests'],

	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:avatar-decoration-requests',

	limit: {
		duration: ms('1day'),
		max: 10,
	},

	errors: {
		functionDisabled: {
			message: 'The avatar decoration request feature is currently disabled.',
			code: 'FUNCTION_DISABLED',
			id: '4bc09040-5b4a-4f95-8e2c-3d0a1eb1f8c1',
		},
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'a4813f4a-fe9d-4e60-9f34-8bda5a9d6f7f',
		},
		accessDenied: {
			message: 'You do not have permission to use this file.',
			code: 'ACCESS_DENIED',
			id: '2e97e9c8-8e4b-4e2b-8ff5-2e0e2c6d9d10',
		},
		unsupportedFileType: {
			message: 'Unsupported file type.',
			code: 'UNSUPPORTED_FILE_TYPE',
			id: 'c4a24e0e-8f56-4c5b-9e2e-2a9f5c6b8e12',
		},
		tooManyPendingRequests: {
			message: 'You have too many pending avatar decoration requests.',
			code: 'TOO_MANY_PENDING_REQUESTS',
			id: 'f0e6c4b3-9c1a-4a2d-8b6a-1e4d7f9c2a3b',
		},
		// JUICE
		captchaFailed: {
			message: 'Captcha verification failed.',
			code: 'CAPTCHA_FAILED',
			id: '9d3f1c2e-6b8a-4c1e-9a2b-3e5c7d9f1a2c',
		},
		// JUICE: 差し替え申請(既存のデコレーションの画像だけを差し替える)関連
		noSuchTargetAvatarDecoration: {
			message: 'No such target avatar decoration.',
			code: 'NO_SUCH_TARGET_AVATAR_DECORATION',
			id: 'f903e6ab-a059-4ae5-b8f5-f2c073b7e423',
		},
		notAvatarDecorationOwner: {
			message: 'You can only request to replace an avatar decoration that was created from your own approved request.',
			code: 'NOT_AVATAR_DECORATION_OWNER',
			id: 'eebe4860-b32f-48b4-a7c2-d5ef4712e01b',
		},
		duplicateReplacementRequest: {
			message: 'You already have a pending replacement request for this avatar decoration.',
			code: 'DUPLICATE_REPLACEMENT_REQUEST',
			id: '16198780-409b-419a-8ca6-85c31d4b688d',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'AvatarDecorationRequestEntry',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		fileId: { type: 'string', format: 'misskey:id' },
		// 各上限はavatar_decoration_requestテーブルの列定義に合わせる
		name: { type: 'string', minLength: 1, maxLength: 256 },
		description: { type: 'string', maxLength: 2048, default: '' },
		category: { type: 'string', nullable: true, maxLength: 128 },
		deleteFileAfterReview: { type: 'boolean', default: false },
		// JUICE: 差し替え申請(既存のデコレーションの画像だけを差し替える)。指定した場合、
		// name等の他のフィールドは無視され、承認されると対象デコレーションの画像のみが差し替わる
		targetAvatarDecorationId: { type: 'string', format: 'misskey:id', nullable: true },
		// JUICE
		'hcaptcha-response': { type: 'string', nullable: true },
		'g-recaptcha-response': { type: 'string', nullable: true },
		'm-captcha-response': { type: 'string', nullable: true },
		'turnstile-response': { type: 'string', nullable: true },
		'testcaptcha-response': { type: 'string', nullable: true },
	},
	required: ['fileId', 'name'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.avatarDecorationRequestsRepository)
		private avatarDecorationRequestsRepository: AvatarDecorationRequestsRepository,

		@Inject(DI.avatarDecorationsRepository)
		private avatarDecorationsRepository: AvatarDecorationsRepository,

		private idService: IdService,
		private roleService: RoleService,
		private juiceSettingsService: JuiceSettingsService,
		private captchaService: CaptchaService,
		private juiceAdminNotificationService: JuiceAdminNotificationService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// JUICE
			await this.captchaService.verifyRequestCaptcha(this.serverSettings, {
				hcaptcha: ps['hcaptcha-response'],
				mcaptcha: ps['m-captcha-response'],
				recaptcha: ps['g-recaptcha-response'],
				turnstile: ps['turnstile-response'],
				testcaptcha: ps['testcaptcha-response'],
			}).catch(err => {
				throw new ApiError(meta.errors.captchaFailed, { message: err.message });
			});

			const { avatarDecorationRequestEnabled } = resolveAvatarDecorationRequestSettings(await this.juiceSettingsService.fetch());
			if (!avatarDecorationRequestEnabled) throw new ApiError(meta.errors.functionDisabled);

			const driveFile = await this.driveFilesRepository.findOneBy({ id: ps.fileId });
			if (driveFile == null) throw new ApiError(meta.errors.noSuchFile);
			if (driveFile.userId !== me.id) throw new ApiError(meta.errors.accessDenied);
			if (!FILE_TYPE_IMAGE.includes(driveFile.type)) throw new ApiError(meta.errors.unsupportedFileType);

			const policies = await this.roleService.getUserPolicies(me.id);
			const pendingCount = await this.avatarDecorationRequestsRepository.countBy({ userId: me.id, status: 'pending' });
			if (pendingCount >= policies.avatarDecorationRequestLimit) throw new ApiError(meta.errors.tooManyPendingRequests);

			// JUICE: 差し替え申請(既存のデコレーションの画像だけを差し替える)。対象は申請者自身の
			// 承認済み申請(resultAvatarDecorationId)から作られたデコレーションのみに限定する
			if (ps.targetAvatarDecorationId != null) {
				const targetDecoration = await this.avatarDecorationsRepository.findOneBy({ id: ps.targetAvatarDecorationId });
				if (targetDecoration == null) throw new ApiError(meta.errors.noSuchTargetAvatarDecoration);

				const ownApprovedRequest = await this.avatarDecorationRequestsRepository.findOneBy({
					userId: me.id,
					resultAvatarDecorationId: ps.targetAvatarDecorationId,
					status: 'approved',
				});
				if (ownApprovedRequest == null) throw new ApiError(meta.errors.notAvatarDecorationOwner);

				const duplicatePending = await this.avatarDecorationRequestsRepository.findOneBy({
					userId: me.id,
					targetAvatarDecorationId: ps.targetAvatarDecorationId,
					status: 'pending',
				});
				if (duplicatePending != null) throw new ApiError(meta.errors.duplicateReplacementRequest);
			}

			const request = await this.avatarDecorationRequestsRepository.insertOne({
				id: this.idService.gen(),
				userId: me.id,
				fileId: driveFile.id,
				name: ps.name,
				description: ps.description,
				category: ps.category ?? null,
				status: 'pending',
				deleteFileAfterReview: ps.deleteFileAfterReview,
				targetAvatarDecorationId: ps.targetAvatarDecorationId ?? null,
			});

			// JUICE: モデレータへ新規申請をリアルタイム通知(admin stream + SystemWebhook)
			await this.juiceAdminNotificationService.notifyNewAvatarDecorationRequest({
				id: request.id,
				name: request.name,
				category: request.category,
				requester: await this.userEntityService.pack(me, null, { schema: 'UserLite' }),
			});

			return {
				id: request.id,
				createdAt: this.idService.parse(request.id).date.toISOString(),
				fileId: request.fileId,
				// JUICE: 一覧でサムネイル表示に使う
				fileUrl: driveFile.url,
				name: request.name,
				description: request.description,
				category: request.category,
				status: request.status,
				rejectReason: request.rejectReason,
				reviewedAt: request.reviewedAt?.toISOString() ?? null,
				resultAvatarDecorationId: request.resultAvatarDecorationId,
				targetAvatarDecorationId: request.targetAvatarDecorationId,
			};
		});
	}
}
