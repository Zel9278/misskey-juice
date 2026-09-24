/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { GetterService } from '@/server/api/GetterService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApiError } from '@/server/api/error.js';

// 投稿後に「小説」フラグ(JUICE)だけを切り替えるための単体エンドポイント。
// update-ai-generated.tsと同じく、ノート編集機能を持たないこのフォークでフラグ専用の狭い
// エンドポイントとして分離し、noteStream:<id> チャンネルに novelChanged として配信する。
export const meta = {
	tags: ['notes'],

	requireCredential: true,
	prohibitMoved: true,

	kind: 'write:notes',

	limit: {
		duration: ms('1hour'),
		max: 300,
		minInterval: ms('1sec'),
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '796c7f28-537d-4463-8ea0-aa53f7cd8191',
		},

		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '4d0b88ac-ef94-4cdd-85e9-dda90386ecf4',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Note',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		isNovel: { type: 'boolean' },
	},
	required: ['noteId', 'isNovel'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private getterService: GetterService,
		private noteEntityService: NoteEntityService,
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			if (note.userId !== me.id) {
				throw new ApiError(meta.errors.accessDenied);
			}

			await this.notesRepository.update(note.id, {
				isNovel: ps.isNovel,
			});

			this.globalEventService.publishNoteStream(note, 'novelChanged', {
				isNovel: ps.isNovel,
			});

			return await this.noteEntityService.pack(note.id, me, { detail: true });
		});
	}
}
