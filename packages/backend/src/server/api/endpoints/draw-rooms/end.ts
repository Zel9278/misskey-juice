/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DrawRoomService } from '@/core/DrawRoomService.js';
import { drawRoomErrors, rethrowDrawRoomError } from '@/server/api/draw-room-errors.js';

// JUICE: 部屋主が、絵チャを終了する
export const meta = {
	tags: ['draw-rooms'],

	requireCredential: true,

	kind: 'write:draw-rooms',

	limit: {
		duration: ms('1minute'),
		max: 60,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'DrawRoom',
	},

	errors: {
		disabled: drawRoomErrors.disabled,
		noSuchRoom: drawRoomErrors.noSuchRoom,
		forbidden: drawRoomErrors.forbidden,
		notOwner: drawRoomErrors.notOwner,
		ended: drawRoomErrors.ended,
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
				const ended = await this.drawRoomService.end(room, me);
				return await this.drawRoomService.pack(ended, me);
			} catch (err) {
				rethrowDrawRoomError(err);
			}
		});
	}
}
