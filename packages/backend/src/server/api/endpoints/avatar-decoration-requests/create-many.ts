/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AvatarDecorationRequestsRepository, DriveFilesRepository, MiMeta } from '@/models/_.js';
import { MiAvatarDecorationRequest } from '@/models/AvatarDecorationRequest.js';
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

// JUICE: 同一画面から複数件のアバターデコレーション申請をまとめて作成するためのエンドポイント。
// キャプチャは1リクエストにつき1回しか検証できない(hCaptcha等のトークンは使い切りのため)ので、
// 単純にavatar-decoration-requests/createを複数回呼ぶ方式は取れず、キャプチャ検証を1回だけ
// 行った上で全件をまとめて作成する専用エンドポイントとして新設している。
export const meta = {
	tags: ['avatar-decoration-requests'],

	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:avatar-decoration-requests',

	// JUICE: 1回の呼び出しで最大maxItems件まとめて作成できるため、単体のavatar-decoration-requests/create
	// と同じmaxのままだと1日あたりの実質作成上限が跳ね上がってしまう(呼び出し回数ではなく件数で
	// 考える必要がある)。maxItemsとのバランスを取り、1日あたりの理論上限が単体版から極端に
	// 増えすぎない範囲に絞っている
	limit: {
		duration: ms('1day'),
		max: 5,
	},

	errors: {
		functionDisabled: {
			message: 'The avatar decoration request feature is currently disabled.',
			code: 'FUNCTION_DISABLED',
			id: '988ff080-985d-4791-a52a-b0f5f685b263',
		},
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: '0f55ebfc-99de-4ecd-9a48-b054db2ccd87',
		},
		accessDenied: {
			message: 'You do not have permission to use this file.',
			code: 'ACCESS_DENIED',
			id: '500ad872-9b9c-46f5-b745-cc07de108d4a',
		},
		unsupportedFileType: {
			message: 'Unsupported file type.',
			code: 'UNSUPPORTED_FILE_TYPE',
			id: '5c187f63-e90c-4b64-bd26-d7eb3c5e03eb',
		},
		tooManyPendingRequests: {
			message: 'You have too many pending avatar decoration requests.',
			code: 'TOO_MANY_PENDING_REQUESTS',
			id: '6464d773-c959-467a-8bd7-6b8af8085b6e',
		},
		captchaFailed: {
			message: 'Captcha verification failed.',
			code: 'CAPTCHA_FAILED',
			id: '69d26e92-13f8-4149-991b-1c49a624b09b',
		},
	},

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'AvatarDecorationRequestEntry',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		requests: {
			type: 'array',
			minItems: 1,
			maxItems: 10,
			items: {
				type: 'object',
				properties: {
					fileId: { type: 'string', format: 'misskey:id' },
					// 各上限はavatar_decoration_requestテーブルの列定義に合わせる
					name: { type: 'string', minLength: 1, maxLength: 256 },
					description: { type: 'string', maxLength: 2048, default: '' },
					category: { type: 'string', nullable: true, maxLength: 128 },
					deleteFileAfterReview: { type: 'boolean', default: false },
				},
				required: ['fileId', 'name'],
			},
		},
		'hcaptcha-response': { type: 'string', nullable: true },
		'g-recaptcha-response': { type: 'string', nullable: true },
		'm-captcha-response': { type: 'string', nullable: true },
		'turnstile-response': { type: 'string', nullable: true },
		'testcaptcha-response': { type: 'string', nullable: true },
	},
	required: ['requests'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.db)
		private db: DataSource,

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
			// JUICE: キャプチャは全体で1回だけ検証する
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

			// JUICE: 1件でも無効なファイルがあれば全体を拒否する(一部だけ作成される中途半端な状態を避ける)
			const driveFiles = await Promise.all(ps.requests.map(async req => {
				const driveFile = await this.driveFilesRepository.findOneBy({ id: req.fileId });
				if (driveFile == null) throw new ApiError(meta.errors.noSuchFile);
				if (driveFile.userId !== me.id) throw new ApiError(meta.errors.accessDenied);
				if (!FILE_TYPE_IMAGE.includes(driveFile.type)) throw new ApiError(meta.errors.unsupportedFileType);
				return driveFile;
			}));

			const policies = await this.roleService.getUserPolicies(me.id);
			const pendingCount = await this.avatarDecorationRequestsRepository.countBy({ userId: me.id, status: 'pending' });
			if (pendingCount + ps.requests.length > policies.avatarDecorationRequestLimit) throw new ApiError(meta.errors.tooManyPendingRequests);

			const newRequests = ps.requests.map((req, i) => ({
				id: this.idService.gen(),
				userId: me.id,
				fileId: driveFiles[i].id,
				name: req.name,
				description: req.description ?? '',
				category: req.category ?? null,
				status: 'pending' as const,
				deleteFileAfterReview: req.deleteFileAfterReview ?? false,
			}));

			await this.db.transaction(async em => {
				await em.insert(MiAvatarDecorationRequest, newRequests);
			});

			const requester = await this.userEntityService.pack(me, null, { schema: 'UserLite' });

			// JUICE: モデレータへ新規申請をリアルタイム通知(admin stream + SystemWebhook)
			await Promise.all(newRequests.map(request => this.juiceAdminNotificationService.notifyNewAvatarDecorationRequest({
				id: request.id,
				name: request.name,
				category: request.category,
				requester,
			})));

			return newRequests.map(request => ({
				id: request.id,
				createdAt: this.idService.parse(request.id).date.toISOString(),
				fileId: request.fileId,
				name: request.name,
				description: request.description,
				category: request.category,
				status: request.status,
				rejectReason: null,
				reviewedAt: null,
				resultAvatarDecorationId: null,
			}));
		});
	}
}
