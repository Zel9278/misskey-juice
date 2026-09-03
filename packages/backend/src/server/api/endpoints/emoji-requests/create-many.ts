/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { DriveFilesRepository, EmojiRequestsRepository, MiMeta } from '@/models/_.js';
import { MiEmojiRequest } from '@/models/EmojiRequest.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveEmojiRequestSettings } from '@/models/JuiceSettings.js';
import { CaptchaService } from '@/core/CaptchaService.js';
import { JuiceAdminNotificationService } from '@/core/JuiceAdminNotificationService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { FILE_TYPE_IMAGE } from '@/const.js';
import { ApiError } from '@/server/api/error.js';

// JUICE: 同一画面から複数件の絵文字申請をまとめて作成するためのエンドポイント。
// キャプチャは1リクエストにつき1回しか検証できない(hCaptcha等のトークンは使い切りのため)ので、
// 単純にemoji-requests/createを複数回呼ぶ方式は取れず、キャプチャ検証を1回だけ行った上で
// 全件をまとめて作成する専用エンドポイントとして新設している。
export const meta = {
	tags: ['emoji-requests'],

	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:emoji-requests',

	// JUICE: 1回の呼び出しで最大maxItems件まとめて作成できるため、単体のemoji-requests/createと
	// 同じmaxのままだと1日あたりの実質作成上限が跳ね上がってしまう(呼び出し回数ではなく件数で
	// 考える必要がある)。maxItemsとのバランスを取り、1日あたりの理論上限が単体版から極端に
	// 増えすぎない範囲に絞っている
	limit: {
		duration: ms('1day'),
		max: 5,
	},

	errors: {
		functionDisabled: {
			message: 'The emoji request feature is currently disabled.',
			code: 'FUNCTION_DISABLED',
			id: '6a65a15d-d8af-4ff5-9dd5-694a528d4165',
		},
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: '48580617-bd8a-4402-ab8c-5ea54a9e2641',
		},
		accessDenied: {
			message: 'You do not have permission to use this file.',
			code: 'ACCESS_DENIED',
			id: '28278dca-526e-4a7a-a249-da7226ca23f4',
		},
		unsupportedFileType: {
			message: 'Unsupported file type.',
			code: 'UNSUPPORTED_FILE_TYPE',
			id: '3b14c56c-c394-425c-a040-102061f557e6',
		},
		tooManyPendingRequests: {
			message: 'You have too many pending emoji requests.',
			code: 'TOO_MANY_PENDING_REQUESTS',
			id: 'c3882573-1595-4033-98cf-9af88775109b',
		},
		captchaFailed: {
			message: 'Captcha verification failed.',
			code: 'CAPTCHA_FAILED',
			id: 'ab428e25-8007-4bef-96f5-9a6b011bc509',
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
		requests: {
			type: 'array',
			minItems: 1,
			maxItems: 10,
			items: {
				type: 'object',
				properties: {
					fileId: { type: 'string', format: 'misskey:id' },
					// 各上限はemoji_requestテーブルの列定義に合わせる
					name: { type: 'string', pattern: '^[a-zA-Z0-9_]+$', maxLength: 128 },
					category: { type: 'string', nullable: true, maxLength: 128 },
					aliases: { type: 'array', items: { type: 'string', maxLength: 128 }, maxItems: 100, default: [] },
					license: { type: 'string', nullable: true, maxLength: 1024 },
					isSensitive: { type: 'boolean', default: false },
					localOnly: { type: 'boolean', default: false },
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

		@Inject(DI.emojiRequestsRepository)
		private emojiRequestsRepository: EmojiRequestsRepository,

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

			const { emojiRequestEnabled } = resolveEmojiRequestSettings(await this.juiceSettingsService.fetch());
			if (!emojiRequestEnabled) throw new ApiError(meta.errors.functionDisabled);

			// JUICE: 1件でも無効なファイルがあれば全体を拒否する(一部だけ作成される中途半端な状態を避ける)
			const driveFiles = await Promise.all(ps.requests.map(async req => {
				const driveFile = await this.driveFilesRepository.findOneBy({ id: req.fileId });
				if (driveFile == null) throw new ApiError(meta.errors.noSuchFile);
				if (driveFile.userId !== me.id) throw new ApiError(meta.errors.accessDenied);
				if (!FILE_TYPE_IMAGE.includes(driveFile.type)) throw new ApiError(meta.errors.unsupportedFileType);
				return driveFile;
			}));

			const policies = await this.roleService.getUserPolicies(me.id);
			const pendingCount = await this.emojiRequestsRepository.countBy({ userId: me.id, status: 'pending' });
			if (pendingCount + ps.requests.length > policies.emojiRequestLimit) throw new ApiError(meta.errors.tooManyPendingRequests);

			const newRequests = ps.requests.map((req, i) => ({
				id: this.idService.gen(),
				userId: me.id,
				fileId: driveFiles[i].id,
				name: req.name,
				category: req.category ?? null,
				aliases: req.aliases ?? [],
				license: req.license ?? null,
				isSensitive: req.isSensitive ?? false,
				localOnly: req.localOnly ?? false,
				status: 'pending' as const,
				deleteFileAfterReview: req.deleteFileAfterReview ?? false,
			}));

			await this.db.transaction(async em => {
				await em.insert(MiEmojiRequest, newRequests);
			});

			const requester = await this.userEntityService.pack(me, null, { schema: 'UserLite' });

			// JUICE: モデレータへ新規申請をリアルタイム通知(admin stream + SystemWebhook)
			await Promise.all(newRequests.map(request => this.juiceAdminNotificationService.notifyNewEmojiRequest({
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
				category: request.category,
				aliases: request.aliases,
				license: request.license,
				isSensitive: request.isSensitive,
				localOnly: request.localOnly,
				status: request.status,
				rejectReason: null,
				reviewedAt: null,
				resultEmojiId: null,
			}));
		});
	}
}
