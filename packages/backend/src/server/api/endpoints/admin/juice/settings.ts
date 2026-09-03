/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveSignupApprovalSettings, resolveEmailSettings, resolveEmojiRequestSettings, resolveAvatarDecorationRequestSettings, resolveRankingSettings, resolveRelayTimelineSettings, resolveLatexSettings } from '@/models/JuiceSettings.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'read:admin:juice-settings',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			approvalRequiredForSignup: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			signupReasonRequired: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			signupReasonMaxLength: {
				type: 'number',
				optional: false, nullable: false,
			},
			defaultEmailLang: {
				type: 'string',
				optional: false, nullable: false,
			},
			emojiRequestEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			avatarDecorationRequestEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			rankingAggregationPeriodHours: {
				type: 'number',
				optional: false, nullable: false,
			},
			rankingDisplayCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			relayTimelineEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			latexEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
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
		private juiceSettingsService: JuiceSettingsService,
	) {
		super(meta, paramDef, async () => {
			const settings = await this.juiceSettingsService.fetch();
			return {
				...resolveSignupApprovalSettings(settings),
				...resolveEmailSettings(settings),
				...resolveEmojiRequestSettings(settings),
				...resolveAvatarDecorationRequestSettings(settings),
				...resolveRankingSettings(settings),
				...resolveRelayTimelineSettings(settings),
				...resolveLatexSettings(settings),
			};
		});
	}
}
