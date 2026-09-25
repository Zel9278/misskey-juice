/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DrawRoomService } from '@/core/DrawRoomService.js';
import { drawRoomErrors, rethrowDrawRoomError } from '@/server/api/draw-room-errors.js';

// JUICE: 部屋主が、終了した(保存した)絵チャの部屋を削除する。モデレーターは開催中の部屋も含めて、どの部屋でも削除できる
export const meta = {
	tags: ['draw-rooms'],

	requireCredential: true,

	kind: 'write:draw-rooms',

	limit: {
		duration: ms('1minute'),
		max: 60,
	},

	errors: {
		disabled: drawRoomErrors.disabled,
		noSuchRoom: drawRoomErrors.noSuchRoom,
		forbidden: drawRoomErrors.forbidden,
		notOwner: drawRoomErrors.notOwner,
		notEnded: drawRoomErrors.notEnded,
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
				await this.drawRoomService.delete(room, me);
			} catch (err) {
				rethrowDrawRoomError(err);
			}
		});
	}
}
