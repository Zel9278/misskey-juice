/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { IdService } from '@/core/IdService.js';
import type { UserNicknameRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { GetterService } from '@/server/api/GetterService.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { ApiError } from '../../error.js';

// JUICE: 他ユーザーに対して自分だけに見えるニックネームを設定する(misskey-tempuraを参考)。
// users/update-memoと全く同じ構成にしている。
export const meta = {
	tags: ['account'],

	requireCredential: true,

	kind: 'write:account',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '19f569ae-bb6c-457d-844d-e286b7bf2b90',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		nickname: {
			type: 'string',
			nullable: true,
			maxLength: 128,
			description: 'A personal nickname for the target user. If null or empty, delete the nickname.',
		},
	},
	required: ['userId', 'nickname'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userNicknamesRepository)
		private userNicknamesRepository: UserNicknameRepository,
		private getterService: GetterService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Get target
			const target = await this.getterService.getUser(ps.userId).catch(err => {
				if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
				throw err;
			});

			// 引数がnullか空文字であれば、ニックネームを削除する
			if (ps.nickname === '' || ps.nickname == null) {
				await this.userNicknamesRepository.delete({
					userId: me.id,
					targetUserId: target.id,
				});
				return;
			}

			// 以前に作成されたニックネームがあるかどうか確認
			const previousNickname = await this.userNicknamesRepository.findOneBy({
				userId: me.id,
				targetUserId: target.id,
			});

			if (!previousNickname) {
				try {
					await this.userNicknamesRepository.insert({
						id: this.idService.gen(),
						userId: me.id,
						targetUserId: target.id,
						nickname: ps.nickname,
					});
				} catch (err) {
					// 同時リクエストでユニーク制約違反になった場合はupdateにフォールバックする
					if (isDuplicateKeyValueError(err)) {
						await this.userNicknamesRepository.update({
							userId: me.id,
							targetUserId: target.id,
						}, {
							nickname: ps.nickname,
						});
					} else {
						throw err;
					}
				}
			} else {
				await this.userNicknamesRepository.update(previousNickname.id, {
					userId: me.id,
					targetUserId: target.id,
					nickname: ps.nickname,
				});
			}
		});
	}
}
