/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { EmailService } from '@/core/EmailService.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
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
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private moderationLogService: ModerationLogService,
		private emailService: EmailService,
		private deleteAccountService: DeleteAccountService,
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
				this.emailService.sendEmail(profile.email, 'Signup declined / 登録が却下されました',
					'Your signup application has been declined.<br><br>アカウントの登録申請は却下されました。',
					'Your signup application has been declined.\n\nアカウントの登録申請は却下されました。');
			}

			this.moderationLogService.log(me, 'declineSignup', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
			});

			await this.deleteAccountService.deleteAccount(user);
		});
	}
}
