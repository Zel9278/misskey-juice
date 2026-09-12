/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiNote } from './Note.js';
import { MiChatMessage } from './ChatMessage.js';

export type AbuseReportResolveType = 'accept' | 'reject';

// JUICE: 通報の対象コンテンツ種別(未指定=従来通りユーザーのみを対象とした通報)
export type AbuseReportTargetType = 'note' | 'chatMessage';

@Entity('abuse_user_report')
export class MiAbuseUserReport {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column(id())
	public targetUserId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public targetUser: MiUser | null;

	@Index()
	@Column(id())
	public reporterId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public reporter: MiUser | null;

	@Column({
		...id(),
		nullable: true,
	})
	public assigneeId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public assignee: MiUser | null;

	@Index()
	@Column('boolean', {
		default: false,
	})
	public resolved: boolean;

	/**
	 * リモートサーバーに転送したかどうか
	 */
	@Column('boolean', {
		default: false,
	})
	public forwarded: boolean;

	@Column('varchar', {
		length: 2048,
	})
	public comment: string;

	@Column('varchar', {
		length: 8192, default: '',
	})
	public moderationNote: string;

	/**
	 * accept 是認 ... 通報内容が正当であり、肯定的に対応された
	 * reject 否認 ... 通報内容が正当でなく、否定的に対応された
	 * null ... その他
	 */
	@Column('varchar', {
		length: 128, nullable: true,
	})
	public resolvedAs: AbuseReportResolveType | null;

	// JUICE: 通報カテゴリ(admin設定のreportCategoriesのkeyを参照。設定側で削除されてもこの値は残る)
	@Column('varchar', {
		length: 64, nullable: true,
		comment: 'Report category key, references admin-configured reportCategories (JUICE).',
	})
	public category: string | null;

	// JUICE: 通報対象コンテンツの種別。null(従来通り)の場合、targetNoteId/targetChatMessageIdも常にnull
	@Column('varchar', {
		length: 32, nullable: true,
		comment: 'Report target content type: note | chatMessage | null (user only) (JUICE).',
	})
	public targetType: AbuseReportTargetType | null;

	// JUICE: 通報対象のノート(削除されたらSET NULL、通報自体の記録は残す)
	@Column({
		...id(),
		nullable: true,
	})
	public targetNoteId: MiNote['id'] | null;

	@ManyToOne(() => MiNote, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public targetNote: MiNote | null;

	// JUICE: 通報対象のチャットメッセージ(削除されたらSET NULL、通報自体の記録は残す)
	@Column({
		...id(),
		nullable: true,
	})
	public targetChatMessageId: MiChatMessage['id'] | null;

	@ManyToOne(() => MiChatMessage, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public targetChatMessage: MiChatMessage | null;

	// JUICE: 通報者が記述した、どのような状況で発生したかの説明(commentとは別の自由記述欄)
	@Column('varchar', {
		length: 2048, nullable: true,
		comment: 'Reporter-provided description of the situation/circumstances (JUICE).',
	})
	public situationDetail: string | null;

	//#region Denormalized fields
	@Index()
	@Column('varchar', {
		length: 128, nullable: true,
		comment: '[Denormalized]',
	})
	public targetUserHost: string | null;

	@Index()
	@Column('varchar', {
		length: 128, nullable: true,
		comment: '[Denormalized]',
	})
	public reporterHost: string | null;
	//#endregion
}
