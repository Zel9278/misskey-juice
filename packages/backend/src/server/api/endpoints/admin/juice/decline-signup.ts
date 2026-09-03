/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { SignupApprovalChecksRepository, UsedUsernamesRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { EmailService } from '@/core/EmailService.js';
import { EmailI18nService } from '@/core/EmailI18nService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	// JUICE: モデレーター/管理者、またはcanApproveSignupsロールポリシーを持つユーザーのみ許可
	requiredRolePolicyOrModerator: 'canApproveSignups',
	kind: 'write:admin:juice-decline-signup',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '37965999-8bb5-4cf6-aaa4-41f57fa2f8a8',
			httpStatusCode: 404,
		},
		alreadyApproved: {
			message: 'The user is already approved.',
			code: 'ALREADY_APPROVED',
			id: '8e2bd22e-44b4-4cd2-8faa-147bfbe6998a',
			httpStatusCode: 400,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		// JUICE
		reason: { type: 'string', maxLength: 1024 },
	},
	required: ['userId', 'reason'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.usedUsernamesRepository)
		private usedUsernamesRepository: UsedUsernamesRepository,

		@Inject(DI.signupApprovalChecksRepository)
		private signupApprovalChecksRepository: SignupApprovalChecksRepository,

		private moderationLogService: ModerationLogService,
		private emailService: EmailService,
		private emailI18nService: EmailI18nService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });
			if (user == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}
			if (user.approved) {
				throw new ApiError(meta.errors.alreadyApproved);
			}

			const profile = await this.userProfilesRepository.findOneBy({ userId: user.id });
			if (profile?.email != null) {
				const lang = await this.emailI18nService.resolveLang(profile.emailLang);
				const i18n = this.emailI18nService.getI18n(lang);
				this.emailService.sendEmail(profile.email, i18n.t('_email.signupDeclined.subject'),
					i18n.t('_email.signupDeclined.html', { reason: ps.reason }),
					i18n.t('_email.signupDeclined.text', { reason: ps.reason }));
			}

			this.moderationLogService.log(me, 'declineSignup', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
				reason: ps.reason,
			});

			// ユーザー行を削除する前に引換コードの状態を更新しておく(JUICE)。
			// FKはON DELETE SET NULLなので、削除後もこのレコード自体は残り、
			// メールアドレスを持たない申請者でもコードから却下された理由を確認できる。
			await this.signupApprovalChecksRepository.update({ userId: user.id }, {
				status: 'declined',
				reason: ps.reason,
				reviewerId: me.id,
				reviewedAt: new Date(),
			});

			// 承認前(approved: false)のアカウントは、サインインもAPI利用も全面的にブロックされているため
			// ノート・ファイル等の実データを一切持ち得ない。そのため DeleteAccountService の非同期キュー経由の
			// 削除(ノート/ファイル削除 → soft delete → 後日キューワーカーが物理削除)は使わず、この場で
			// 直接物理削除する。DeleteAccountService 経由だと、実際の usersRepository.delete() は非同期
			// キュージョブが処理するまで発生しないため、却下直後に同じユーザー名で再登録しようとすると
			// (used_username からは削除済みでも) user テーブルの重複チェックで弾かれてしまう。
			// user_profile / user_keypair / role_assignment 等は外部キーの ON DELETE CASCADE で連鎖削除される。
			await this.usersRepository.delete(user.id);

			// 却下されたアカウントは一度も承認されておらず実質的に使われていないため、
			// 通常のアカウント削除(used_usernameを残してユーザー名の再利用を防ぐ)とは異なり、
			// 却下後は同じユーザー名で再度登録申請できるようにする。
			// usernameLower は select: false のため findOneBy では取得できておらず、
			// SignupService と同じ username.toLowerCase() で代用する
			await this.usedUsernamesRepository.delete({ username: user.username.toLowerCase() });
		});
	}
}
