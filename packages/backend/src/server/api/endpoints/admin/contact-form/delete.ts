/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ContactFormService } from '@/core/ContactFormService.js';
import { ApiError } from '@/server/api/error.js';

// JUICE: misskey-tempuraのコンタクトフォームを参考に追加
export const meta = {
	tags: ['admin'],
	requireCredential: true,
	// JUICE: 問い合わせ内容にメールアドレス・IPアドレス等のPIIを含むため、承認ロールポリシーへの委譲はせずモデレーター/管理者に限定する
	requireModerator: true,
	kind: 'write:admin:contact-form',
	secure: true,

	errors: {
		noSuchContactForm: {
			message: 'No such contact form.',
			code: 'NO_SUCH_CONTACT_FORM',
			id: '75d41110-429b-4f31-a33c-9d5e2e4768dc',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		contactFormId: { type: 'string', format: 'misskey:id' },
	},
	required: ['contactFormId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private contactFormService: ContactFormService,
	) {
		super(meta, paramDef, async (ps) => {
			const contactForm = await this.contactFormService.show(ps.contactFormId);
			if (!contactForm) throw new ApiError(meta.errors.noSuchContactForm);

			await this.contactFormService.delete(ps.contactFormId);
		});
	}
}
