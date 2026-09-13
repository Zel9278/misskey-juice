/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { DriveFilesRepository } from '@/models/_.js';
import { DriveService } from '@/core/DriveService.js';
import { RoleService } from '@/core/RoleService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../../error.js';

// JUICE: Driveページで複数ファイルを選択して一括削除するためのエンドポイント。
// 本家には一括移動(drive/files/move-bulk)はあるが一括削除が無かったため新設した。
export const meta = {
	tags: ['drive'],

	requireCredential: true,

	kind: 'write:drive',

	errors: {
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: '392f8dc0-6a15-4bc9-8b7e-2fa7a0e6f7c9',
		},

		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '5f7cd8a4-6d99-4d27-9dcc-6d1f6f5e2b8a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		fileIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 100, items: { type: 'string', format: 'misskey:id' } },
	},
	required: ['fileIds'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private driveService: DriveService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const files = await this.driveFilesRepository.findBy({ id: In(ps.fileIds) });
			if (files.length !== ps.fileIds.length) throw new ApiError(meta.errors.noSuchFile);

			const isModerator = await this.roleService.isModerator(me);
			if (!isModerator && files.some(file => file.userId !== me.id)) throw new ApiError(meta.errors.accessDenied);

			// JUICE: 単体削除(drive/files/delete)と同様、実際の削除完了を待ってから応答する
			await Promise.all(files.map(file => this.driveService.deleteFileSync(file, false, me)));
		});
	}
}
