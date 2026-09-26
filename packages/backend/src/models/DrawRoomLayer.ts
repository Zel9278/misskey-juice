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
	// JUICE: fillは塗りつぶし(囲って塗る・バケツ)。pointsは多角形の頂点で、筆圧の値が0の点から次の輪郭が始まる
	// (穴のある形も、偶奇規則で塗る)
	tool: 'pen' | 'eraser' | 'fill';
	color: string;
	size: number;
	// 不透明度(0.05〜1)。無ければ1(以前に描かれた線)
	opacity?: number;
	// JUICE: 筆の種類。softはにじみ筆(ふちのぼけた筆跡を重ねる)、dotはドット(画素単位でくっきり描く)。無ければ普通の筆
	brush?: 'soft' | 'dot';
	// JUICE: 線の中だけ塗る(はみ出し防止)で、この線が塗れる範囲の多角形(pointsと同じ形式。印が0の点から次の輪郭)
	clip?: string;
	// JUICE: 移動ツールでずらした量(キャンバス座標)。点の列はそのままにして、描くときにこの分ずらす
	dx?: number;
	dy?: number;
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
