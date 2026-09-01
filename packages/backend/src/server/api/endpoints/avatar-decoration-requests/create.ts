/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AvatarDecorationRequestsRepository, DriveFilesRepository, MiMeta } from '@/models/_.js';
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

			const request = await this.avatarDecorationRequestsRepository.insertOne({
				id: this.idService.gen(),
				userId: me.id,
				fileId: driveFile.id,
				name: ps.name,
				description: ps.description,
				category: ps.category ?? null,
				status: 'pending',
				deleteFileAfterReview: ps.deleteFileAfterReview,
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
				name: request.name,
				description: request.description,
				category: request.category,
				status: request.status,
				rejectReason: request.rejectReason,
				reviewedAt: request.reviewedAt?.toISOString() ?? null,
				resultAvatarDecorationId: request.resultAvatarDecorationId,
			};
		});
	}
}
