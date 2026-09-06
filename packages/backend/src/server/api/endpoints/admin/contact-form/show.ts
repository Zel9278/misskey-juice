/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ContactFormEntityService } from '@/core/entities/ContactFormEntityService.js';
import { ContactFormService } from '@/core/ContactFormService.js';
import { ApiError } from '@/server/api/error.js';
import { RoleService } from '@/core/RoleService.js';

// JUICE: misskey-tempuraのコンタクトフォームを参考に追加
export const meta = {
	tags: ['admin'],
	requireCredential: true,
	// JUICE: モデレーター/管理者、またはcanProcessContactFormsロールポリシーを持つユーザーのみ許可。
	// 問い合わせ内容にはメールアドレス・IPアドレス等のPIIを含むため、モデレーター以外にはこれらをマスクして返す
	requiredRolePolicyOrModerator: 'canProcessContactForms',
	kind: 'read:admin:contact-form',
	secure: true,

	errors: {
		noSuchContactForm: {
			message: 'No such contact form.',
			code: 'NO_SUCH_CONTACT_FORM',
			id: '757e3ac5-08d3-4ccc-8755-1d9973c4f39d',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ContactForm',
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
		private contactFormEntityService: ContactFormEntityService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const contactForm = await this.contactFormService.show(ps.contactFormId);
			if (!contactForm) throw new ApiError(meta.errors.noSuchContactForm);

			const isModerator = await this.roleService.isModerator(me);
			return await this.contactFormEntityService.pack(contactForm, { maskPii: !isModerator });
		});
	}
}
