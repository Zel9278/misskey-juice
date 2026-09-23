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

// 装飾的なMFMを含む投稿を自動でローカルのみにする機能(JUICE)。標準マークダウン系
// (太字・斜体・取り消し線・コード)とMFM独自の装飾系(center・fn等)を別々に設定できる。
// 完全にユーザー個別設定(管理者トグルなし)。i/update.ts (upstream管理・高頻度変更) には
// 触れず、JUICE専用エンドポイントとして分離する
export const meta = {
	tags: ['account'],

	requireCredential: true,

	kind: 'write:account',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		autoLocalOnlyForMarkdownMfm: { type: 'boolean' },
		autoLocalOnlyForFnMfm: { type: 'boolean' },
	},
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
			const update: Partial<{ autoLocalOnlyForMarkdownMfm: boolean; autoLocalOnlyForFnMfm: boolean }> = {};
			if (ps.autoLocalOnlyForMarkdownMfm !== undefined) update.autoLocalOnlyForMarkdownMfm = ps.autoLocalOnlyForMarkdownMfm;
			if (ps.autoLocalOnlyForFnMfm !== undefined) update.autoLocalOnlyForFnMfm = ps.autoLocalOnlyForFnMfm;

			await this.userProfilesRepository.update(me.id, update);

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
