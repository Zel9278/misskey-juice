/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiDrawRoom } from './DrawRoom.js';

/**
 * JUICE: 絵チャの部屋で描ける人(メンバー)。見学者はここに入らない。
 * 部屋主もメンバーとして1件持つ(人数上限に含める)。
 */
@Entity('draw_room_member')
@Index(['roomId', 'userId'], { unique: true })
export class MiDrawRoomMember {
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

	@Index()
	@Column({
		...id(),
	})
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;
}
