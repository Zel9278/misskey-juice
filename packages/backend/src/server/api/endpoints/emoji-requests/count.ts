/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { EmojiRequestsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveEmojiRequestSettings } from '@/models/JuiceSettings.js';
import { ApiError } from '@/server/api/error.js';

// JUICE: 申請フォームで「あと何件申請できるか」を表示するための専用エンドポイント。
// 上限自体はi.policies.emojiRequestLimitで既に取得できるため、ここでは現在の
// 審査待ち件数だけを返す
export const meta = {
	tags: ['emoji-requests'],

	requireCredential: true,
	kind: 'read:emoji-requests',

	errors: {
		functionDisabled: {
			message: 'The emoji request feature is currently disabled.',
			code: 'FUNCTION_DISABLED',
			id: '10465027-b400-483b-8a79-16ba6b32ede8',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			pending: {
				type: 'number',
				optional: false, nullable: false,
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
		@Inject(DI.emojiRequestsRepository)
		private emojiRequestsRepository: EmojiRequestsRepository,

		private juiceSettingsService: JuiceSettingsService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const { emojiRequestEnabled } = resolveEmojiRequestSettings(await this.juiceSettingsService.fetch());
			if (!emojiRequestEnabled) throw new ApiError(meta.errors.functionDisabled);

			const pending = await this.emojiRequestsRepository.countBy({ userId: me.id, status: 'pending' });
			return { pending };
		});
	}
}
