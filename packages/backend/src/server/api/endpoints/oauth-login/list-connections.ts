/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { UserOauthConnectionsRepository } from '@/models/_.js';

// JUICE: 連携ログイン。自分が連携済みのプロバイダ一覧を返す
export const meta = {
	tags: ['account'],

	requireCredential: true,
	secure: true,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				provider: { type: 'string', optional: false, nullable: false },
				providerUsername: { type: 'string', optional: false, nullable: false },
				linkedAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
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
		@Inject(DI.userOauthConnectionsRepository)
		private userOauthConnectionsRepository: UserOauthConnectionsRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const connections = await this.userOauthConnectionsRepository.findBy({ userId: me.id });

			return connections.map(c => ({
				provider: c.provider,
				providerUsername: c.providerUsername,
				linkedAt: c.linkedAt.toISOString(),
			}));
		});
	}
}
