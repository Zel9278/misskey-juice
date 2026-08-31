/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

// JUICE: 他ユーザーに対して自分だけに見えるニックネームを設定できる機能(misskey-tempuraを参考)。
// UserMemo(userId, targetUserId)と全く同じ構成にしている。
@Entity('user_nickname')
@Index(['userId', 'targetUserId'], { unique: true })
export class MiUserNickname {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
		comment: 'The ID of author.',
	})
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Index()
	@Column({
		...id(),
		comment: 'The ID of target user.',
	})
	public targetUserId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public targetUser: MiUser | null;

	@Column('varchar', {
		length: 128,
		comment: 'Nickname.',
	})
	public nickname: string;
}
