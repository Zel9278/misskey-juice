/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AvatarDecorationRequestsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { avatarDecorationRequestStatuses } from '@/models/AvatarDecorationRequest.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	// JUICE: モデレーター/管理者、またはcanApproveAvatarDecorationRequestsロールポリシーを持つユーザーのみ許可
	requiredRolePolicyOrModerator: 'canApproveAvatarDecorationRequests',
	kind: 'read:admin:avatar-decoration-requests',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'AvatarDecorationRequestEntryDetailedAdmin',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		state: { type: 'string', enum: avatarDecorationRequestStatuses, default: 'pending' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.avatarDecorationRequestsRepository)
		private avatarDecorationRequestsRepository: AvatarDecorationRequestsRepository,

		private queryService: QueryService,
		private idService: IdService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.queryService.makePaginationQuery(this.avatarDecorationRequestsRepository.createQueryBuilder('request'), ps.sinceId, ps.untilId)
				.andWhere('request.status = :status', { status: ps.state })
				.leftJoinAndSelect('request.user', 'user')
				.leftJoinAndSelect('request.file', 'file')
				.leftJoinAndSelect('request.reviewer', 'reviewer');

			const requests = await query.limit(ps.limit).getMany();

			return await Promise.all(requests.map(async request => ({
				id: request.id,
				createdAt: this.idService.parse(request.id).date.toISOString(),
				fileId: request.fileId,
				name: request.name,
				description: request.description,
				category: request.category,
				status: request.status,
				rejectReason: request.rejectReason,
				reviewedAt: request.reviewedAt?.toISOString() ?? null,
				// JUICE: 審査履歴に「誰が審査したか」を表示するために使う
				reviewer: request.reviewer ? await this.userEntityService.pack(request.reviewer, me, { schema: 'UserLite' }) : null,
				resultAvatarDecorationId: request.resultAvatarDecorationId,
				targetAvatarDecorationId: request.targetAvatarDecorationId,
				user: await this.userEntityService.pack(request.user ?? request.userId, me, { schema: 'UserLite' }),
				fileUrl: request.file?.url ?? null,
			})));
		});
	}
}
