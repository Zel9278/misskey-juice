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

// 投稿後に「AI生成物」フラグ(JUICE)だけを切り替えるための単体エンドポイント。
// このフォークにはノート編集機能自体が存在しない(upstreamで実装→revertされた形跡あり)ため、
// フル編集機能は作らず、このフラグ専用の狭いエンドポイントとして分離する。
// ストリーム配信は publishNoteStream 経由の noteStream:<id> チャンネル(reacted/unreacted/pollVoted/deleted
// で既に使われている生きているインフラ)に aiGeneratedChanged として乗せる。フロント側は
// use-note-capture.ts の $note (ReactiveNoteData) に isAIGenerated を反映し、購読中のタブで即時反映される。
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
			id: '5de6fad9-4118-4eed-93a4-0d5bedf27f86',
		},

		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '4eaecbfc-e188-4e36-a2ff-a29fb8bfa6e4',
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
		isAIGenerated: { type: 'boolean' },
	},
	required: ['noteId', 'isAIGenerated'],
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
				isAIGenerated: ps.isAIGenerated,
			});

			this.globalEventService.publishNoteStream(note, 'aiGeneratedChanged', {
				isAIGenerated: ps.isAIGenerated,
			});

			return await this.noteEntityService.pack(note.id, me, { detail: true });
		});
	}
}
