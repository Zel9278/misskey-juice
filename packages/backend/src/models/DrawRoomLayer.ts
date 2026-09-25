/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiDrawRoom } from './DrawRoom.js';

// JUICE: 1本の線。pointsは点の列をバイナリに詰めてbase64にしたもの(形式は DrawRoomService の decodeDrawPoints を参照)
export type DrawStroke = {
	id: string;
	tool: 'pen' | 'eraser';
	color: string;
	size: number;
	// 不透明度(0.05〜1)。無ければ1(以前に描かれた線)
	opacity?: number;
	points: string;
};

/**
 * JUICE: 終了後も保存する(keepAfterEnd)絵チャの部屋で、ユーザーごとのレイヤーの線をDBに残したもの。
 * 開催中の線はRedisにあり、ここには入らない。
 */
@Entity('draw_room_layer')
@Index(['roomId', 'userId'], { unique: true })
export class MiDrawRoomLayer {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
	})
	public roomId: MiDrawRoom['id'];

	@ManyToOne(() => MiDrawRoom, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public room: MiDrawRoom | null;

	@Column({
		...id(),
	})
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Column('jsonb', {
		default: [],
	})
	public strokes: DrawStroke[];
}
