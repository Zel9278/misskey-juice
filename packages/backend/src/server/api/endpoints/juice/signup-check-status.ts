/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { MiMeta, SignupApprovalChecksRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { CaptchaService } from '@/core/CaptchaService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,

	description: 'Check the approval status of a pending signup application using its check code (JUICE).',

	limit: {
		duration: ms('1hour'),
		max: 30,
	},

	errors: {
		// JUICE
		captchaFailed: {
			message: 'Captcha verification failed.',
			code: 'CAPTCHA_FAILED',
			id: 'fbea36d0-8e72-4b5e-b752-a49e16abd09d',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			status: {
				type: 'string',
				optional: false, nullable: false,
				enum: ['pending', 'approved', 'declined', 'notFound'],
			},
			// JUICE: 却下時の理由。却下されていない場合や、まだ理由が記録されていない古いレコードではnull
			reason: {
				type: 'string',
				optional: false, nullable: true,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		code: { type: 'string', minLength: 1 },
		// JUICE: 端末に保存済みのコードを画面表示のたびに黙って再確認する経路(isNewSubmission省略)ではcaptchaを要求しない。
		// 新規にコードを追加して確認するとき(isNewSubmission: true)のみcaptchaを必須にする。
		isNewSubmission: { type: 'boolean', default: false },
		'hcaptcha-response': { type: 'string', nullable: true },
		'g-recaptcha-response': { type: 'string', nullable: true },
		'm-captcha-response': { type: 'string', nullable: true },
		'turnstile-response': { type: 'string', nullable: true },
		'testcaptcha-response': { type: 'string', nullable: true },
	},
	required: ['code'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.signupApprovalChecksRepository)
		private signupApprovalChecksRepository: SignupApprovalChecksRepository,

		private captchaService: CaptchaService,
	) {
		super(meta, paramDef, async (ps) => {
			// JUICE
			if (ps.isNewSubmission) {
				await this.captchaService.verifyRequestCaptcha(this.serverSettings, {
					hcaptcha: ps['hcaptcha-response'],
					mcaptcha: ps['m-captcha-response'],
					recaptcha: ps['g-recaptcha-response'],
					turnstile: ps['turnstile-response'],
					testcaptcha: ps['testcaptcha-response'],
				}).catch(err => {
					throw new ApiError(meta.errors.captchaFailed, { message: err.message });
				});
			}

			const check = await this.signupApprovalChecksRepository.findOneBy({ code: ps.code });

			return {
				status: check?.status ?? 'notFound',
				reason: check?.reason ?? null,
			};
		});
	}
}
