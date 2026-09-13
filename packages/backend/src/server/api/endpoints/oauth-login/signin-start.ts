/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveOauthLoginSettings } from '@/models/JuiceSettings.js';
import { OAuthLoginService } from '@/core/OAuthLoginService.js';
import { oauthLoginProviders } from '@/models/UserOauthConnection.js';
import { ApiError } from '@/server/api/error.js';

// JUICE: 連携ログイン。未ログインの状態から、既にアカウントへ連携済みのDiscord/Google/GitHub
// でサインインするためのOAuth認可URLを発行する
export const meta = {
	tags: ['account'],

	requireCredential: false,

	limit: {
		duration: 1000 * 60,
		max: 20,
	},

	errors: {
		providerDisabled: {
			message: 'This OAuth provider is not enabled on this instance.',
			code: 'PROVIDER_DISABLED',
			id: '3e916c17-8fca-4eb2-a0d6-459f19e10d64',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			url: { type: 'string', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		provider: { type: 'string', enum: oauthLoginProviders },
		returnTo: { type: 'string', nullable: true },
	},
	required: ['provider'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private juiceSettingsService: JuiceSettingsService,
		private oAuthLoginService: OAuthLoginService,
	) {
		super(meta, paramDef, async (ps) => {
			const settings = resolveOauthLoginSettings(await this.juiceSettingsService.fetch());
			const enabled = settings[`${ps.provider}OauthEnabled`];
			const clientId = settings[`${ps.provider}OauthClientId`];
			const clientSecret = settings[`${ps.provider}OauthClientSecret`];

			if (!enabled || clientId == null || clientSecret == null) {
				throw new ApiError(meta.errors.providerDisabled);
			}

			const returnTo = this.oAuthLoginService.sanitizeReturnTo(ps.returnTo);

			const url = await this.oAuthLoginService.issueSigninState({
				provider: ps.provider,
				returnTo,
			}, clientId);

			return { url };
		});
	}
}
