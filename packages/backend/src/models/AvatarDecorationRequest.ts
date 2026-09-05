/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiDriveFile } from './DriveFile.js';
import { MiAvatarDecoration } from './AvatarDecoration.js';

// アバターデコレーション申請の状態(JUICE)。emoji_requestのstatusと同じ意味合い。
// pending: 審査待ち、approved: 承認済み(デコレーションとして登録済み)、rejected: 却下済み。
export const avatarDecorationRequestStatuses = ['pending', 'approved', 'rejected'] as const;

@Entity('avatar_decoration_request')
export class MiAvatarDecorationRequest {
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
		length: 256,
		comment: 'The requested avatar decoration name (JUICE).',
	})
	public name: string;

	@Column('varchar', {
		length: 2048,
		comment: 'The requested avatar decoration description (JUICE).',
	})
	public description: string;

	@Column('varchar', {
		length: 128, nullable: true,
		comment: 'The requested avatar decoration category (JUICE).',
	})
	public category: string | null;

	@Index()
	@Column('varchar', {
		length: 16, default: 'pending',
		comment: 'The status of this request (JUICE): pending, approved, or rejected.',
	})
	public status: typeof avatarDecorationRequestStatuses[number];

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
		comment: 'The ID of the avatar decoration created upon approval (JUICE).',
	})
	public resultAvatarDecorationId: MiAvatarDecoration['id'] | null;

	@ManyToOne(() => MiAvatarDecoration, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public resultAvatarDecoration: MiAvatarDecoration | null;

	@Column('boolean', {
		default: false,
		comment: 'Whether to delete the attached file from the requester\'s Drive once this request is reviewed (JUICE).',
	})
	public deleteFileAfterReview: boolean;

	// JUICE: 差し替え申請(既存のデコレーションの画像だけを差し替える)の対象。nullなら通常の新規申請。
	// 差し替え対象にできるのは、申請者自身の承認済み申請(resultAvatarDecorationId)から
	// 作られたデコレーションのみ
	@Index()
	@Column({
		...id(),
		nullable: true,
		comment: 'The ID of the avatar decoration this request wants to replace the image of, if this is a replacement request (JUICE).',
	})
	public targetAvatarDecorationId: MiAvatarDecoration['id'] | null;

	@ManyToOne(() => MiAvatarDecoration, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public targetAvatarDecoration: MiAvatarDecoration | null;
}
