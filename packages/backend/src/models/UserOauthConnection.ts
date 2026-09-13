/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export const oauthLoginProviders = ['discord', 'google', 'github', 'gitlab', 'microsoft'] as const;
export type OauthLoginProvider = typeof oauthLoginProviders[number];

// JUICE: 連携ログイン(Discord/Google/GitHub/GitLab/Microsoft)で紐付けたアカウントを保持するテーブル。
// アクセストークン自体はプロフィール取得の一度きりの用途にしか使わないため保存しない
// (providerUserId/providerUsernameのみ永続化する)
@Entity('user_oauth_connection')
@Index(['provider', 'providerUserId'], { unique: true })
@Index(['userId', 'provider'], { unique: true })
export class MiUserOauthConnection {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Column('varchar', {
		length: 32,
		comment: 'The OAuth provider this connection belongs to (JUICE).',
	})
	public provider: OauthLoginProvider;

	@Column('varchar', {
		length: 256,
		comment: 'The user id on the provider side (JUICE).',
	})
	public providerUserId: string;

	@Column('varchar', {
		length: 256,
		comment: 'The display username on the provider side, for UI purposes only (JUICE).',
	})
	public providerUsername: string;

	@Column('timestamp with time zone', {
		default: () => 'now()',
	})
	public linkedAt: Date;

	constructor(data: Partial<MiUserOauthConnection>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}
