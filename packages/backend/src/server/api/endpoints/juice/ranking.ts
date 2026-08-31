/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { JuiceUserRankingService, type JuiceUserRankingEntry } from '@/core/JuiceUserRankingService.js';

export const meta = {
	tags: ['juice'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 60,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			periodHours: {
				type: 'number',
				optional: false, nullable: false,
			},
			posts: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						user: {
							type: 'object',
							optional: false, nullable: false,
							ref: 'UserLite',
						},
						count: {
							type: 'integer',
							optional: false, nullable: false,
						},
					},
				},
			},
			reactions: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						user: {
							type: 'object',
							optional: false, nullable: false,
							ref: 'UserLite',
						},
						count: {
							type: 'integer',
							optional: false, nullable: false,
						},
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private userEntityService: UserEntityService,
		private juiceUserRankingService: JuiceUserRankingService,
	) {
		super(meta, paramDef, async () => {
			const [periodHours, postRanking, reactionRanking] = await Promise.all([
				this.juiceUserRankingService.getPeriodHours(),
				this.juiceUserRankingService.getPostRanking(3),
				this.juiceUserRankingService.getReactionRanking(3),
			]);

			const userIds = [...new Set([...postRanking, ...reactionRanking].map(e => e.userId))];
			const users = userIds.length === 0 ? [] : await this.usersRepository.findBy({ id: In(userIds) });
			const packedUsers = await this.userEntityService.packMany(users, null);

			const toEntries = (ranking: JuiceUserRankingEntry[]) => ranking
				.map(e => ({ user: packedUsers.find(u => u.id === e.userId), count: e.score }))
				.filter((e): e is { user: NonNullable<typeof e.user>; count: number } => e.user != null);

			return {
				periodHours,
				posts: toEntries(postRanking),
				reactions: toEntries(reactionRanking),
			};
		});
	}
}
