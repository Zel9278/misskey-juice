/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveSignupApprovalSettings, resolveEmojiRequestSettings, resolveRelayTimelineSettings, resolveLatexSettings } from '@/models/JuiceSettings.js';

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
				...resolveEmojiRequestSettings(settings),
				...resolveRelayTimelineSettings(settings),
				...resolveLatexSettings(settings),
			};
		});
	}
}
