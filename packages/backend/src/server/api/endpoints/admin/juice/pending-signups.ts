/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	kind: 'read:admin:juice-pending-signups',

	errors: {
		// JUICE: モデレーターまたはcanApproveSignupsロールポリシーを持つユーザーのみ許可
		accessDenied: {
			message: 'You do not have permission to access pending signups.',
			code: 'ACCESS_DENIED',
			kind: 'permission',
			id: 'cd0d82b2-9e0c-4669-95d2-809602e498e8',
		},
	},

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
					format: 'id',
				},
				createdAt: {
					type: 'string',
					optional: false, nullable: false,
					format: 'date-time',
				},
				username: {
					type: 'string',
					optional: false, nullable: false,
				},
				host: {
					type: 'string',
					optional: false, nullable: true,
				},
				signupReason: {
					type: 'string',
					optional: false, nullable: true,
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private queryService: QueryService,
		private idService: IdService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (!(await this.roleService.hasRoleCapability(me, 'canApproveSignups'))) {
				throw new ApiError(meta.errors.accessDenied);
			}

			const query = this.queryService.makePaginationQuery(this.usersRepository.createQueryBuilder('user'), ps.sinceId, ps.untilId)
				.andWhere('user.approved = FALSE')
				.andWhere('user.host IS NULL')
				.addSelect('user.signupReason');

			const users = await query.limit(ps.limit).getMany();

			return users.map(user => ({
				id: user.id,
				createdAt: this.idService.parse(user.id).date.toISOString(),
				username: user.username,
				host: user.host,
				signupReason: user.signupReason,
			}));
		});
	}
}
