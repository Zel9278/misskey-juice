/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { UserOauthConnectionsRepository, UserProfilesRepository } from '@/models/_.js';
import { ApiError } from '@/server/api/error.js';
import { oauthLoginProviders } from '@/models/UserOauthConnection.js';

// JUICE: 連携ログイン。指定プロバイダの連携を解除する。連携中のプロバイダが0件になった場合、
// useOauthLoginも自動的にfalseへ戻す(サインイン手段として使えるプロバイダが無い状態を防ぐ)
export const meta = {
	tags: ['account'],

	requireCredential: true,
	secure: true,

	errors: {
		noSuchConnection: {
			message: 'No such OAuth connection.',
			code: 'NO_SUCH_CONNECTION',
			id: '8b7a1deb-ecf8-494a-be6b-32de1ff96c84',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		provider: { type: 'string', enum: oauthLoginProviders },
	},
	required: ['provider'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userOauthConnectionsRepository)
		private userOauthConnectionsRepository: UserOauthConnectionsRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const result = await this.userOauthConnectionsRepository.delete({ userId: me.id, provider: ps.provider });
			if (result.affected === 0) {
				throw new ApiError(meta.errors.noSuchConnection);
			}

			const remaining = await this.userOauthConnectionsRepository.countBy({ userId: me.id });
			if (remaining === 0) {
				await this.userProfilesRepository.update(me.id, { useOauthLogin: false });
			}
		});
	}
}
