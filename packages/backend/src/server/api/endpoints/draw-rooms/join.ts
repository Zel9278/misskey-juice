/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DrawRoomService } from '@/core/DrawRoomService.js';
import { drawRoomErrors, rethrowDrawRoomError } from '@/server/api/draw-room-errors.js';

// JUICE: 絵チャの部屋に、描ける人(メンバー)として参加する。満員なら参加できない(見学はできる)
export const meta = {
	tags: ['draw-rooms'],

	requireCredential: true,

	kind: 'write:draw-rooms',

	// JUICE: 引っ越し済みのアカウントは参加できない(部屋を作るのと同じ扱い)
	prohibitMoved: true,

	limit: {
		duration: ms('1minute'),
		max: 60,
	},

	errors: {
		disabled: drawRoomErrors.disabled,
		noSuchRoom: drawRoomErrors.noSuchRoom,
		forbidden: drawRoomErrors.forbidden,
		ended: drawRoomErrors.ended,
		full: drawRoomErrors.full,
		kicked: drawRoomErrors.kicked,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
	},
	required: ['roomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private drawRoomService: DrawRoomService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const room = await this.drawRoomService.getRoom(ps.roomId, me);
				await this.drawRoomService.join(room, me);
			} catch (err) {
				rethrowDrawRoomError(err);
			}
		});
	}
}
