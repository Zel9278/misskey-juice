/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import type { JuiceSettingsValue } from '@/models/JuiceSettings.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:juice-settings',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		approvalRequiredForSignup: { type: 'boolean' },
		signupReasonRequired: { type: 'boolean' },
		signupReasonMaxLength: { type: 'integer', minimum: 1 },
		defaultEmailLang: { type: 'string' },
		emojiRequestEnabled: { type: 'boolean' },
		avatarDecorationRequestEnabled: { type: 'boolean' },
		rankingAggregationPeriodHours: { type: 'integer', minimum: 1 },
		rankingDisplayCount: { type: 'integer', minimum: 1, maximum: 100 },
		relayTimelineEnabled: { type: 'boolean' },
		latexEnabled: { type: 'boolean' },
		reactionPiggybackOnRemoteEnabled: { type: 'boolean' },
		contactFormEnabled: { type: 'boolean' },
		contactFormLimit: { type: 'integer', minimum: 1, maximum: 100 },
		contactFormRequireAuth: { type: 'boolean' },
		contactFormCategories: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					key: { type: 'string', minLength: 1, maxLength: 64 },
					text: { type: 'string', minLength: 1, maxLength: 128 },
					enabled: { type: 'boolean' },
					order: { type: 'integer' },
					isDefault: { type: 'boolean' },
				},
				required: ['key', 'text', 'enabled', 'order', 'isDefault'],
			},
		},
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private juiceSettingsService: JuiceSettingsService,
		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const before = await this.juiceSettingsService.fetch(true);

			// paramDef に additionalProperties: false を指定していないため、
			// ps には認証トークン(i)等の余分なフィールドが含まれうる。
			// jsonb にそのまま紛れ込ませないよう、既知のフィールドだけを明示的に拾う。
			const set: Partial<JuiceSettingsValue> = {};
			if (ps.approvalRequiredForSignup !== undefined) set.approvalRequiredForSignup = ps.approvalRequiredForSignup;
			if (ps.signupReasonRequired !== undefined) set.signupReasonRequired = ps.signupReasonRequired;
			if (ps.signupReasonMaxLength !== undefined) set.signupReasonMaxLength = ps.signupReasonMaxLength;
			if (ps.defaultEmailLang !== undefined) set.defaultEmailLang = ps.defaultEmailLang;
			if (ps.emojiRequestEnabled !== undefined) set.emojiRequestEnabled = ps.emojiRequestEnabled;
			if (ps.avatarDecorationRequestEnabled !== undefined) set.avatarDecorationRequestEnabled = ps.avatarDecorationRequestEnabled;
			if (ps.rankingAggregationPeriodHours !== undefined) set.rankingAggregationPeriodHours = ps.rankingAggregationPeriodHours;
			if (ps.rankingDisplayCount !== undefined) set.rankingDisplayCount = ps.rankingDisplayCount;
			if (ps.relayTimelineEnabled !== undefined) set.relayTimelineEnabled = ps.relayTimelineEnabled;
			if (ps.latexEnabled !== undefined) set.latexEnabled = ps.latexEnabled;
			if (ps.reactionPiggybackOnRemoteEnabled !== undefined) set.reactionPiggybackOnRemoteEnabled = ps.reactionPiggybackOnRemoteEnabled;
			if (ps.contactFormEnabled !== undefined) set.contactFormEnabled = ps.contactFormEnabled;
			if (ps.contactFormLimit !== undefined) set.contactFormLimit = ps.contactFormLimit;
			if (ps.contactFormRequireAuth !== undefined) set.contactFormRequireAuth = ps.contactFormRequireAuth;
			if (ps.contactFormCategories !== undefined) set.contactFormCategories = ps.contactFormCategories;

			const after = await this.juiceSettingsService.update(set);

			this.moderationLogService.log(me, 'updateJuiceSettings', {
				before,
				after,
			});
		});
	}
}
