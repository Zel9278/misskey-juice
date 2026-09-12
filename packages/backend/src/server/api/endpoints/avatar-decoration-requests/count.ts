/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AvatarDecorationRequestsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveAvatarDecorationRequestSettings } from '@/models/JuiceSettings.js';
import { ApiError } from '@/server/api/error.js';

// JUICE: 申請フォームで「あと何件申請できるか」を表示するための専用エンドポイント。
// 上限自体はi.policies.avatarDecorationRequestLimitで既に取得できるため、ここでは
// 現在の審査待ち件数だけを返す
export const meta = {
	tags: ['avatar-decoration-requests'],

	requireCredential: true,
	kind: 'read:avatar-decoration-requests',

	errors: {
		functionDisabled: {
			message: 'The avatar decoration request feature is currently disabled.',
			code: 'FUNCTION_DISABLED',
			id: '8509c4c5-b03a-40d1-acc0-d49ebeec6d45',
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
		@Inject(DI.avatarDecorationRequestsRepository)
		private avatarDecorationRequestsRepository: AvatarDecorationRequestsRepository,

		private juiceSettingsService: JuiceSettingsService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const { avatarDecorationRequestEnabled } = resolveAvatarDecorationRequestSettings(await this.juiceSettingsService.fetch());
			if (!avatarDecorationRequestEnabled) throw new ApiError(meta.errors.functionDisabled);

			const pending = await this.avatarDecorationRequestsRepository.countBy({ userId: me.id, status: 'pending' });
			return { pending };
		});
	}
}
