/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveSignupApprovalSettings, resolveEmojiRequestSettings, resolveAvatarDecorationRequestSettings, resolveRelayTimelineSettings, resolveLatexSettings, resolveReactionPiggybackSettings, resolveContactFormSettings } from '@/models/JuiceSettings.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,

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
			emojiRequestEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			avatarDecorationRequestEnabled: {
				type: 'boolean',
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
			reactionPiggybackOnRemoteEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			contactFormEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			contactFormRequireAuth: {
				type: 'boolean',
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
			const { contactFormEnabled, contactFormRequireAuth, contactFormCategories } = resolveContactFormSettings(settings);
			return {
				...resolveSignupApprovalSettings(settings),
				...resolveEmojiRequestSettings(settings),
				...resolveAvatarDecorationRequestSettings(settings),
				...resolveRelayTimelineSettings(settings),
				...resolveLatexSettings(settings),
				...resolveReactionPiggybackSettings(settings),
				contactFormEnabled,
				contactFormRequireAuth,
				// JUICE: 公開設定なので無効化されたカテゴリは含めない
				contactFormCategories: contactFormCategories.filter(cat => cat.enabled).sort((a, b) => a.order - b.order),
			};
		});
	}
}
