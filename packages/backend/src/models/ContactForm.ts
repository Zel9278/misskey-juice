/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

// JUICE: misskey-tempuraのコンタクトフォームを参考に追加
@Entity('contact_form')
export class MiContactForm {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone', { nullable: true })
	public updatedAt: Date | null;

	@Column('varchar', { length: 256 })
	public subject: string;

	@Column('text')
	public content: string;

	@Index()
	@Column('enum', {
		enum: ['email', 'misskey'],
	})
	public replyMethod: 'email' | 'misskey';

	@Column('varchar', { length: 256, nullable: true })
	public name: string | null;

	@Column('varchar', { length: 320, nullable: true })
	public email: string | null;

	@Column('varchar', { length: 128, nullable: true })
	public misskeyUsername: string | null;

	@Index()
	@Column('varchar', {
		length: 64,
		default: 'other',
	})
	public category: string;

	@Index()
	@Column('enum', {
		enum: ['pending', 'in_progress', 'resolved', 'closed'],
		default: 'pending',
	})
	public status: 'pending' | 'in_progress' | 'resolved' | 'closed';

	@Column('text', { nullable: true })
	public adminNote: string | null;

	@Column('varchar', { length: 45, nullable: true })
	public ipAddress: string | null;

	@Column('varchar', { length: 1024, nullable: true })
	public userAgent: string | null;

	@Index()
	@Column({ ...id(), nullable: true })
	public userId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, { onDelete: 'SET NULL' })
	@JoinColumn()
	public user: MiUser | null;

	@Index()
	@Column({ ...id(), nullable: true })
	public assignedUserId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, { onDelete: 'SET NULL' })
	@JoinColumn()
	public assignedUser: MiUser | null;

	@Column('varchar', { length: 128, nullable: true })
	public assignedNickname: string | null;
}
