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

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:juice-approve-signup',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'bdcf7c8c-cb42-48c2-a226-47080733cf1f',
			httpStatusCode: 404,
		},
		alreadyApproved: {
			message: 'The user is already approved.',
			code: 'ALREADY_APPROVED',
			id: '224da03a-21ef-4e16-a3eb-e3afc8ff2447',
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
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });
			if (user == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}
			if (user.approved) {
				throw new ApiError(meta.errors.alreadyApproved);
			}

			await this.usersRepository.update(user.id, {
				approved: true,
			});

			this.moderationLogService.log(me, 'approveSignup', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
			});

			const profile = await this.userProfilesRepository.findOneBy({ userId: user.id });
			if (profile?.email != null) {
				this.emailService.sendEmail(profile.email, 'Signup approved / 登録が承認されました',
					'Your account has been approved. You can now sign in.<br><br>アカウントの登録が承認されました。サインインできるようになりました。',
					'Your account has been approved. You can now sign in.\n\nアカウントの登録が承認されました。サインインできるようになりました。');
			}
		});
	}
}
