/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ContactFormsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { ContactFormEntityService } from '@/core/entities/ContactFormEntityService.js';

// JUICE: misskey-tempuraのコンタクトフォームを参考に追加
export const meta = {
	tags: ['admin'],
	requireCredential: true,
	// JUICE: 問い合わせ内容にメールアドレス・IPアドレス等のPIIを含むため、承認ロールポリシーへの委譲はせずモデレーター/管理者に限定する
	requireModerator: true,
	kind: 'read:admin:contact-form',
	secure: true,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'ContactForm',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		status: { type: 'string', enum: ['pending', 'in_progress', 'resolved', 'closed'], nullable: true },
		category: { type: 'string', nullable: true },
		assignedUserId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.contactFormsRepository)
		private contactFormsRepository: ContactFormsRepository,

		private queryService: QueryService,
		private contactFormEntityService: ContactFormEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			const query = this.queryService.makePaginationQuery(this.contactFormsRepository.createQueryBuilder('contactForm'), ps.sinceId, ps.untilId)
				.leftJoinAndSelect('contactForm.user', 'user')
				.leftJoinAndSelect('contactForm.assignedUser', 'assignedUser');

			if (ps.status) {
				query.andWhere('contactForm.status = :status', { status: ps.status });
			}

			if (ps.category) {
				query.andWhere('contactForm.category = :category', { category: ps.category });
			}

			if (ps.assignedUserId) {
				query.andWhere('contactForm.assignedUserId = :assignedUserId', { assignedUserId: ps.assignedUserId });
			}

			const contactForms = await query.limit(ps.limit).getMany();

			return await this.contactFormEntityService.packMany(contactForms);
		});
	}
}
