/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiDriveFile } from './DriveFile.js';
import { MiEmoji } from './Emoji.js';

// 絵文字申請の状態(JUICE)。
// pending: 審査待ち、approved: 承認済み(絵文字として登録済み)、rejected: 却下済み。
export const emojiRequestStatuses = ['pending', 'approved', 'rejected'] as const;

@Entity('emoji_request')
export class MiEmojiRequest {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
		comment: 'The ID of the requester (JUICE).',
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
		nullable: true,
		comment: 'The ID of the attached image file (JUICE).',
	})
	public fileId: MiDriveFile['id'] | null;

	@ManyToOne(() => MiDriveFile, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public file: MiDriveFile | null;

	@Column('varchar', {
		length: 128,
		comment: 'The requested emoji name (JUICE).',
	})
	public name: string;

	@Column('varchar', {
		length: 128, nullable: true,
		comment: 'The requested emoji category (JUICE).',
	})
	public category: string | null;

	@Column('varchar', {
		length: 1024, nullable: true,
		comment: 'The requested emoji license (JUICE).',
	})
	public license: string | null;

	@Column('varchar', {
		length: 128, array: true, default: '{}',
		comment: 'The requested emoji aliases (JUICE).',
	})
	public aliases: string[];

	@Column('boolean', {
		default: false,
		comment: 'Whether the requested emoji should be marked as sensitive (JUICE).',
	})
	public isSensitive: boolean;

	@Column('boolean', {
		default: false,
		comment: 'Whether the requested emoji should be local-only (JUICE).',
	})
	public localOnly: boolean;

	@Index()
	@Column('varchar', {
		length: 16, default: 'pending',
		comment: 'The status of this request (JUICE): pending, approved, or rejected.',
	})
	public status: typeof emojiRequestStatuses[number];

	@Column('text', {
		nullable: true,
		comment: 'The reason for rejection, if rejected (JUICE).',
	})
	public rejectReason: string | null;

	@Index()
	@Column({
		...id(),
		nullable: true,
		comment: 'The ID of the moderator/admin who reviewed this request (JUICE).',
	})
	public reviewerId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public reviewer: MiUser | null;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public reviewedAt: Date | null;

	@Column({
		...id(),
		nullable: true,
		comment: 'The ID of the emoji created upon approval (JUICE).',
	})
	public resultEmojiId: MiEmoji['id'] | null;

	@ManyToOne(() => MiEmoji, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public resultEmoji: MiEmoji | null;

	@Column('boolean', {
		default: false,
		comment: 'Whether to delete the attached file from the requester\'s Drive once this request is reviewed (JUICE).',
	})
	public deleteFileAfterReview: boolean;
}
