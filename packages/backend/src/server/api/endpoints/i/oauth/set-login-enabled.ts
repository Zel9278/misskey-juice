/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { UserOauthConnectionsRepository, UserProfilesRepository } from '@/models/_.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';

// JUICE: 連携ログイン(Discord/Google/GitHub)を実際のサインイン手段として使うかどうかの
// トグル。連携先アカウントの乗っ取りだけでサインインできてしまわないよう、有効化するには
// 2段階認証(twoFactorEnabled)が有効であることと、連携済みプロバイダが1件以上あることを
// 前提条件として強制する(i/2fa/password-less.tsのnoKeyチェックと同じ形)
export const meta = {
	tags: ['account'],

	requireCredential: true,
	secure: true,

	errors: {
		twoFactorRequired: {
			message: 'Two-factor authentication must be enabled to use OAuth login as a sign-in method.',
			code: 'TWO_FACTOR_REQUIRED',
			id: 'b7775934-2877-4f4f-ac2b-35d04dce25bd',
		},
		noConnection: {
			message: 'No linked OAuth provider.',
			code: 'NO_CONNECTION',
			id: '8b7d13a7-77c2-4c00-964e-c43898259995',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		value: { type: 'boolean' },
	},
	required: ['value'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.userOauthConnectionsRepository)
		private userOauthConnectionsRepository: UserOauthConnectionsRepository,

		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.value === true) {
				const profile = await this.userProfilesRepository.findOneByOrFail({ userId: me.id });
				if (!profile.twoFactorEnabled) {
					throw new ApiError(meta.errors.twoFactorRequired);
				}

				const connectionCount = await this.userOauthConnectionsRepository.countBy({ userId: me.id });
				if (connectionCount === 0) {
					throw new ApiError(meta.errors.noConnection);
				}
			}

			await this.userProfilesRepository.update(me.id, {
				useOauthLogin: ps.value,
			});

			// Publish meUpdated event
			this.globalEventService.publishMainStream(me.id, 'meUpdated', await this.userEntityService.pack(me.id, me, {
				schema: 'MeDetailed',
				includeSecrets: true,
			}));
		});
	}
}
