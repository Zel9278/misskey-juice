/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IsNull } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { EmojisRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { EmojiEntityService } from '@/core/entities/EmojiEntityService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 3600,

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'EmojiDetailed',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: {
			type: 'string',
		},
		// JUICE: リアクション相乗り機能で、リモートホストのカスタム絵文字の詳細(ライセンス等)も
		// 確認できるようにするために追加。省略時は従来通りローカルの絵文字のみを対象にする
		host: {
			type: 'string',
			nullable: true,
		},
	},
	required: ['name'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,

		private emojiEntityService: EmojiEntityService,
		private utilityService: UtilityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// JUICE: 空文字列もローカル扱い(null)にする。toPunyNullableは空文字列をそのまま
			// 空文字列として返すため、素通しすると意図せず404になってしまう
			const host = ps.host ? this.utilityService.toPunyNullable(ps.host) : null;

			const emoji = await this.emojisRepository.findOneOrFail({
				where: {
					name: ps.name,
					host: host ?? IsNull(),
				},
			});

			return this.emojiEntityService.packDetailed(emoji);
		});
	}
}
