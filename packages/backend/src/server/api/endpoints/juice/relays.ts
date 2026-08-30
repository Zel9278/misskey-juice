/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { RelayService } from '@/core/RelayService.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveRelayTimelineSettings } from '@/models/JuiceSettings.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['juice'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 60,

	errors: {
		functionDisabled: {
			message: 'The relay timeline feature is currently disabled.',
			code: 'FUNCTION_DISABLED',
			id: 'cc32f1a3-1c22-4b2f-9411-29e48784bd41',
		},
	},

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
					format: 'id',
				},
				host: {
					type: 'string',
					optional: false, nullable: false,
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private relayService: RelayService,
		private juiceSettingsService: JuiceSettingsService,
	) {
		super(meta, paramDef, async () => {
			const { relayTimelineEnabled } = resolveRelayTimelineSettings(await this.juiceSettingsService.fetch());
			if (!relayTimelineEnabled) throw new ApiError(meta.errors.functionDisabled);

			const relays = await this.relayService.listRelay();

			// リレータイムラインの絞り込み選択肢としては、実際に配信を受け付けているリレーだけを見せれば十分
			return relays
				.filter(relay => relay.status === 'accepted')
				.map(relay => ({
					id: relay.id,
					host: new URL(relay.inbox).host,
				}));
		});
	}
}
