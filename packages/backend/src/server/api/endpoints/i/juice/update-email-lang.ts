/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { languages } from 'i18n';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { CacheService } from '@/core/CacheService.js';

// システムメール(パスワードリセット・承認/却下通知等)で使う言語(JUICE)。
// サインアップ時に選ばなかった/後から変更したいユーザーのための単体エンドポイント。
// i/update.ts (upstream管理・高頻度変更) には触れず、JUICE専用エンドポイントとして分離する。
export const meta = {
	tags: ['account'],

	requireCredential: true,

	kind: 'write:account',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		emailLang: { type: 'string', enum: [null, ...languages] as string[], nullable: true },
	},
	required: ['emailLang'],
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
				emailLang: ps.emailLang,
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
