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
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveAvatarDecorationRequestSettings } from '@/models/JuiceSettings.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['avatar-decoration-requests'],

	requireCredential: true,
	kind: 'read:avatar-decoration-requests',

	errors: {
		functionDisabled: {
			message: 'The avatar decoration request feature is currently disabled.',
			code: 'FUNCTION_DISABLED',
			id: 'd9e3a2c1-4b8f-4e6a-9c2d-7f1e3a5b9c0d',
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
		private juiceSettingsService: JuiceSettingsService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const { avatarDecorationRequestEnabled } = resolveAvatarDecorationRequestSettings(await this.juiceSettingsService.fetch());
			if (!avatarDecorationRequestEnabled) throw new ApiError(meta.errors.functionDisabled);

			const query = this.queryService.makePaginationQuery(this.avatarDecorationRequestsRepository.createQueryBuilder('request'), ps.sinceId, ps.untilId)
				.andWhere('request.userId = :userId', { userId: me.id })
				.leftJoinAndSelect('request.file', 'file');

			const requests = await query.limit(ps.limit).getMany();

			return requests.map(request => ({
				id: request.id,
				createdAt: this.idService.parse(request.id).date.toISOString(),
				fileId: request.fileId,
				// JUICE: 一覧でサムネイル表示に使う
				fileUrl: request.file?.url ?? null,
				name: request.name,
				description: request.description,
				category: request.category,
				status: request.status,
				rejectReason: request.rejectReason,
				reviewedAt: request.reviewedAt?.toISOString() ?? null,
				resultAvatarDecorationId: request.resultAvatarDecorationId,
			}));
		});
	}
}
