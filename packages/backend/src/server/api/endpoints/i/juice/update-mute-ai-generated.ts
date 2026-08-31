/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { CacheService } from '@/core/CacheService.js';
import { aiGeneratedNoteMuteModes } from '@/models/UserProfile.js';

// AI生成物としてマークされたノートの扱い(JUICE): なし・ミュート(折りたたみ)・ハードミュート(完全非表示)。
// i/update.ts (upstream管理・高頻度変更) には触れず、JUICE専用エンドポイントとして分離する。
export const meta = {
	tags: ['account'],

	requireCredential: true,

	kind: 'write:account',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		muteAIGeneratedNotes: { type: 'string', enum: [...aiGeneratedNoteMuteModes] },
	},
	required: ['muteAIGeneratedNotes'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
		private cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.userProfilesRepository.update(me.id, {
				muteAIGeneratedNotes: ps.muteAIGeneratedNotes,
			});

			const updatedProfile = await this.userProfilesRepository.findOneByOrFail({ userId: me.id });
			this.cacheService.userProfileCache.set(me.id, updatedProfile);

			const iObj = await this.userEntityService.pack(me.id, me, {
				schema: 'MeDetailed',
				includeSecrets: true,
			});
			this.globalEventService.publishMainStream(me.id, 'meUpdated', iObj);
		});
	}
}
