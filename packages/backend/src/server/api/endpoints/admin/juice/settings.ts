/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveSignupApprovalSettings, resolveExploreOtherServersSettings, resolveEmailSettings, resolveEmojiRequestSettings, resolveAvatarDecorationRequestSettings, resolveRankingSettings, resolveRelayTimelineSettings, resolveMediaTimelineSettings, resolveLatexSettings, resolveReactionPiggybackSettings, resolveContactFormSettings, resolveCustomSplashTextSettings, resolveNewAccountFollowRequestSettings, resolveReportCategorySettings, resolveEmailAliasSettings } from '@/models/JuiceSettings.js';

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
			invitationRegistrationEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			exploreOtherServersEnabled: {
				type: 'boolean',
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
			mediaTimelineEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			latexEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			reactionPiggybackOnRemoteEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			contactFormEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			contactFormLimit: {
				type: 'number',
				optional: false, nullable: false,
			},
			contactFormRequireAuth: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			contactFormContentMaxLength: {
				type: 'number',
				optional: false, nullable: false,
			},
			contactFormCategories: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						key: { type: 'string', optional: false, nullable: false },
						text: { type: 'string', optional: false, nullable: false },
						enabled: { type: 'boolean', optional: false, nullable: false },
						order: { type: 'number', optional: false, nullable: false },
						isDefault: { type: 'boolean', optional: false, nullable: false },
					},
				},
			},
			customSplashText: {
				type: 'array',
				optional: false, nullable: false,
				items: { type: 'string', optional: false, nullable: false },
			},
			newAccountFollowRequestEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			newAccountFollowRequestThresholdMs: {
				type: 'number',
				optional: false, nullable: false,
			},
			reportCategories: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						key: { type: 'string', optional: false, nullable: false },
						text: { type: 'string', optional: false, nullable: false },
						enabled: { type: 'boolean', optional: false, nullable: false },
						order: { type: 'number', optional: false, nullable: false },
						isDefault: { type: 'boolean', optional: false, nullable: false },
					},
				},
			},
			blockEmailDotAliasRegistration: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			blockEmailPlusAliasRegistration: {
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
				...resolveExploreOtherServersSettings(settings),
				...resolveEmailSettings(settings),
				...resolveEmojiRequestSettings(settings),
				...resolveAvatarDecorationRequestSettings(settings),
				...resolveRankingSettings(settings),
				...resolveRelayTimelineSettings(settings),
				...resolveMediaTimelineSettings(settings),
				...resolveLatexSettings(settings),
				...resolveReactionPiggybackSettings(settings),
				...resolveContactFormSettings(settings),
				...resolveCustomSplashTextSettings(settings),
				...resolveNewAccountFollowRequestSettings(settings),
				...resolveReportCategorySettings(settings),
				...resolveEmailAliasSettings(settings),
			};
		});
	}
}
