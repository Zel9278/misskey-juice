/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SearchService } from '@/core/SearchService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { RoleService } from '@/core/RoleService.js';
import { IdService } from '@/core/IdService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},

	errors: {
		unavailable: {
			message: 'Search of notes unavailable.',
			code: 'UNAVAILABLE',
			id: '0b44998d-77aa-4427-80d0-d2c9b8523011',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string', default: '' },
		rangeStartAt: { type: 'integer', nullable: true },
		rangeEndAt: { type: 'integer', nullable: true },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		host: {
			type: 'string',
			description: 'The local host is represented with `.`.',
		},
		userId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		channelId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		// JUICE: misskey-tempuraからチェリーピック
		visibility: { type: 'string', enum: ['all', 'public', 'home', 'followers', 'specified'], default: 'all' },
		hasFiles: { type: 'string', enum: ['all', 'with', 'without'], default: 'all' },
		hasCw: { type: 'string', enum: ['all', 'with', 'without'], default: 'all' },
		hasReply: { type: 'string', enum: ['all', 'with', 'without'], default: 'all' },
		hasPoll: { type: 'string', enum: ['all', 'with', 'without'], default: 'all' },
		searchOperator: { type: 'string', enum: ['and', 'or'], default: 'and' },
		excludeWords: { type: 'array', items: { type: 'string' }, default: [] },
		// JUICE: 自分が付けたリアクションでの絞り込み。`'any'`で「何かしらリアクションしたノート」
		// 全体、それ以外は指定したリアクション文字列と完全一致するものだけ。自分自身のリアクションのみ対象
		myReaction: { type: 'string', nullable: true, default: null },
	},
	required: [],
} as const;

// TODO: ロジックをサービスに切り出す

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private noteEntityService: NoteEntityService,
		private searchService: SearchService,
		private roleService: RoleService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : undefined);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : undefined);

			const policies = await this.roleService.getUserPolicies(me ? me.id : null);
			if (!policies.canSearchNotes) {
				throw new ApiError(meta.errors.unavailable);
			}

			const notes = await this.searchService.searchNote(ps.query, me, {
				userId: ps.userId,
				channelId: ps.channelId,
				host: ps.host,
				rangeStartAt: ps.rangeStartAt,
				rangeEndAt: ps.rangeEndAt,
				// JUICE: misskey-tempuraからチェリーピック
				visibility: ps.visibility,
				hasFiles: ps.hasFiles,
				hasCw: ps.hasCw,
				hasReply: ps.hasReply,
				hasPoll: ps.hasPoll,
				searchOperator: ps.searchOperator,
				excludeWords: ps.excludeWords,
				myReaction: ps.myReaction,
			}, {
				untilId: untilId,
				sinceId: sinceId,
				limit: ps.limit,
			});

			return await this.noteEntityService.packMany(notes, me);
		});
	}
}
