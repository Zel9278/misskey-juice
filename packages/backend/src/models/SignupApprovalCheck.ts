/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, Column, ManyToOne, JoinColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export const signupApprovalCheckStatuses = ['pending', 'approved', 'declined'] as const;

/**
 * 承認式新規登録(JUICE)で、メールアドレスを収集していない申請者でも
 * 審査状況を後から確認できるようにするための引換コード。
 * 却下時にユーザー行自体は削除されるため、このレコードは独立して残す。
 */
@Entity('signup_approval_check')
export class MiSignupApprovalCheck {
	@PrimaryColumn(id())
	public id: string;

	@Index({ unique: true })
	@Column('varchar', {
		length: 64,
		comment: 'The secret code given to the applicant to check their approval status (JUICE).',
	})
	public code: string;

	@ManyToOne(() => MiUser, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Index()
	@Column({
		...id(),
		nullable: true,
	})
	public userId: MiUser['id'] | null;

	@Column('varchar', {
		length: 16,
		default: 'pending',
		comment: 'The approval status of this signup application (JUICE): pending, approved, or declined.',
	})
	public status: typeof signupApprovalCheckStatuses[number];

	@Column('text', {
		nullable: true,
		comment: 'The reason for declining this signup application, if declined (JUICE).',
	})
	public reason: string | null;
}
