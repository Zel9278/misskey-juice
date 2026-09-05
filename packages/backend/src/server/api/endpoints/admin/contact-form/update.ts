/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ContactFormService } from '@/core/ContactFormService.js';
import { ApiError } from '@/server/api/error.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

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
			id: 'e119305b-a803-45a7-b54f-82da03e64278',
		},

		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'd5f2c579-8e1a-4c33-b48b-ac4ae7a625e7',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		contactFormId: { type: 'string', format: 'misskey:id' },
		status: { type: 'string', enum: ['pending', 'in_progress', 'resolved', 'closed'], nullable: true },
		adminNote: { type: 'string', nullable: true },
		assignedUserId: { type: 'string', format: 'misskey:id', nullable: true },
		assignedNickname: { type: 'string', nullable: true, maxLength: 128 },
	},
	required: ['contactFormId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private contactFormService: ContactFormService,
	) {
		super(meta, paramDef, async (ps) => {
			const contactForm = await this.contactFormService.show(ps.contactFormId);
			if (!contactForm) throw new ApiError(meta.errors.noSuchContactForm);

			if (ps.assignedUserId != null) {
				const assignedUser = await this.usersRepository.findOneBy({ id: ps.assignedUserId });
				if (assignedUser == null) throw new ApiError(meta.errors.noSuchUser);
			}

			await this.contactFormService.update(ps.contactFormId, {
				status: ps.status ?? undefined,
				adminNote: ps.adminNote ?? undefined,
				assignedUserId: ps.assignedUserId !== undefined ? ps.assignedUserId : undefined,
				assignedNickname: ps.assignedNickname !== undefined ? ps.assignedNickname : undefined,
			});
		});
	}
}
