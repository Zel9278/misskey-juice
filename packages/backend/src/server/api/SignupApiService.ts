/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { RegistrationTicketsRepository, SignupApprovalChecksRepository, UsedUsernamesRepository, UserPendingsRepository, UserProfilesRepository, UsersRepository, MiRegistrationTicket, MiMeta } from '@/models/_.js';
import type { Config } from '@/config.js';
import { CaptchaService } from '@/core/CaptchaService.js';
import { IdService } from '@/core/IdService.js';
import { SignupService } from '@/core/SignupService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { EmailService } from '@/core/EmailService.js';
import { EmailI18nService } from '@/core/EmailI18nService.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveSignupApprovalSettings } from '@/models/JuiceSettings.js';
import { MiLocalUser } from '@/models/User.js';
import { FastifyReplyError } from '@/misc/fastify-reply-error.js';
import { bindThis } from '@/decorators.js';
import { L_CHARS, secureRndstr } from '@/misc/secure-rndstr.js';
import { SigninService } from './SigninService.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class SignupApiService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.userPendingsRepository)
		private userPendingsRepository: UserPendingsRepository,

		@Inject(DI.usedUsernamesRepository)
		private usedUsernamesRepository: UsedUsernamesRepository,

		@Inject(DI.registrationTicketsRepository)
		private registrationTicketsRepository: RegistrationTicketsRepository,

		@Inject(DI.signupApprovalChecksRepository)
		private signupApprovalChecksRepository: SignupApprovalChecksRepository,

		private userEntityService: UserEntityService,
		private idService: IdService,
		private captchaService: CaptchaService,
		private signupService: SignupService,
		private signinService: SigninService,
		private emailService: EmailService,
		private emailI18nService: EmailI18nService,
		private juiceSettingsService: JuiceSettingsService,
	) {
	}

	// 承認待ちの申請者がメールアドレスなしでも審査状況を確認できるよう、
	// 引換コードを発行してsignup_approval_checkに記録する(JUICE)。
	@bindThis
	private async issueApprovalCheckCode(userId: string): Promise<string> {
		const code = secureRndstr(32, { chars: L_CHARS });
		await this.signupApprovalChecksRepository.insertOne({
			id: this.idService.gen(),
			code,
			userId,
			status: 'pending',
		});
		return code;
	}

	@bindThis
	public async signup(
		request: FastifyRequest<{
			Body: {
				username: string;
				password: string;
				host?: string;
				invitationCode?: string;
				emailAddress?: string;
				reason?: string;
				emailLang?: string;
				'hcaptcha-response'?: string;
				'g-recaptcha-response'?: string;
				'turnstile-response'?: string;
				'm-captcha-response'?: string;
				'testcaptcha-response'?: string;
			}
		}>,
		reply: FastifyReply,
	) {
		const body = request.body;

		// Verify *Captcha
		// ただしテスト時はこの機構は障害となるため無効にする
		if (process.env.NODE_ENV !== 'test') {
			if (this.meta.enableHcaptcha && this.meta.hcaptchaSecretKey) {
				await this.captchaService.verifyHcaptcha(this.meta.hcaptchaSecretKey, body['hcaptcha-response']).catch(err => {
					throw new FastifyReplyError(400, err);
				});
			}

			if (this.meta.enableMcaptcha && this.meta.mcaptchaSecretKey && this.meta.mcaptchaSitekey && this.meta.mcaptchaInstanceUrl) {
				await this.captchaService.verifyMcaptcha(this.meta.mcaptchaSecretKey, this.meta.mcaptchaSitekey, this.meta.mcaptchaInstanceUrl, body['m-captcha-response']).catch(err => {
					throw new FastifyReplyError(400, err);
				});
			}

			if (this.meta.enableRecaptcha && this.meta.recaptchaSecretKey) {
				await this.captchaService.verifyRecaptcha(this.meta.recaptchaSecretKey, body['g-recaptcha-response']).catch(err => {
					throw new FastifyReplyError(400, err);
				});
			}

			if (this.meta.enableTurnstile && this.meta.turnstileSecretKey) {
				await this.captchaService.verifyTurnstile(this.meta.turnstileSecretKey, body['turnstile-response']).catch(err => {
					throw new FastifyReplyError(400, err);
				});
			}

			if (this.meta.enableTestcaptcha) {
				await this.captchaService.verifyTestcaptcha(body['testcaptcha-response']).catch(err => {
					throw new FastifyReplyError(400, err);
				});
			}
		}

		const username = body['username'];
		const password = body['password'];
		const host: string | null = process.env.NODE_ENV === 'test' ? (body['host'] ?? null) : null;
		const invitationCode = body['invitationCode'];
		const emailAddress = body['emailAddress'];
		const reason = typeof body['reason'] === 'string' ? body['reason'] : undefined;
		const emailLang = typeof body['emailLang'] === 'string' ? body['emailLang'] : undefined;

		const { approvalRequiredForSignup, signupReasonRequired, signupReasonMaxLength } =
			resolveSignupApprovalSettings(await this.juiceSettingsService.fetch());

		if (this.meta.emailRequiredForSignup) {
			if (emailAddress == null || typeof emailAddress !== 'string') {
				reply.code(400);
				return;
			}

			const res = await this.emailService.validateEmailForAccount(emailAddress);
			if (!res.available) {
				reply.code(400);
				return;
			}
		}

		let ticket: MiRegistrationTicket | null = null;

		// 承認式登録が有効な場合、招待コードは任意にする(コード無しなら理由入力での申請に回す。
		// コードがあれば従来通り検証し、有効なら承認をバイパスする)
		const invitationCodeOptional = approvalRequiredForSignup;
		const hasInvitationCode = typeof invitationCode === 'string' && invitationCode !== '';

		// テスト時はこの機構は障害となるため無効にする
		if (process.env.NODE_ENV !== 'test' && this.meta.disableRegistration) {
			if (!invitationCodeOptional && !hasInvitationCode) {
				reply.code(400);
				return;
			}

			if (hasInvitationCode) {
				ticket = await this.registrationTicketsRepository.findOneBy({
					code: invitationCode,
				});

				if (ticket == null || ticket.usedById != null) {
					reply.code(400);
					return;
				}

				if (ticket.expiresAt && ticket.expiresAt < new Date()) {
					reply.code(400);
					return;
				}

				// メアド認証が有効の場合
				if (this.meta.emailRequiredForSignup) {
					// メアド認証済みならエラー
					if (ticket.usedBy) {
						reply.code(400);
						return;
					}

					// 認証しておらず、メール送信から30分以内ならエラー
					if (ticket.usedAt && ticket.usedAt.getTime() + (1000 * 60 * 30) > Date.now()) {
						reply.code(400);
						return;
					}
				} else if (ticket.usedAt) {
					reply.code(400);
					return;
				}
			}
		}

		// 招待コードで登録した場合は承認式登録をバイパスする(招待した時点でモデレーターの信任があるため)
		const approvalRequiredForThisSignup = approvalRequiredForSignup && ticket == null;

		if (approvalRequiredForThisSignup) {
			if (signupReasonRequired && (reason == null || reason.trim() === '')) {
				throw new FastifyReplyError(400, 'REASON_REQUIRED');
			}

			if (reason != null && reason.length > signupReasonMaxLength) {
				throw new FastifyReplyError(400, 'REASON_TOO_LONG');
			}
		}

		if (this.meta.emailRequiredForSignup) {
			if (await this.usersRepository.exists({ where: { usernameLower: username.toLowerCase(), host: IsNull() } })) {
				throw new FastifyReplyError(400, 'DUPLICATED_USERNAME');
			}

			// Check deleted username duplication
			if (await this.usedUsernamesRepository.exists({ where: { username: username.toLowerCase() } })) {
				throw new FastifyReplyError(400, 'USED_USERNAME');
			}

			const isPreserved = this.meta.preservedUsernames.map(x => x.toLowerCase()).includes(username.toLowerCase());
			if (isPreserved) {
				throw new FastifyReplyError(400, 'DENIED_USERNAME');
			}

			const code = secureRndstr(16, { chars: L_CHARS });

			// Generate hash of password
			const salt = await bcrypt.genSalt(8);
			const hash = await bcrypt.hash(password, salt);

			const pendingUser = await this.userPendingsRepository.insertOne({
				id: this.idService.gen(),
				code,
				email: emailAddress!,
				username: username,
				password: hash,
				reason: approvalRequiredForThisSignup ? (reason ?? null) : null,
				emailLang: emailLang ?? null,
			});

			const link = `${this.config.url}/signup-complete/${code}`;

			const lang = await this.emailI18nService.resolveLang(emailLang);
			const i18n = this.emailI18nService.getI18n(lang);
			this.emailService.sendEmail(emailAddress!, i18n.t('_email.signupConfirm.subject'),
				i18n.t('_email.signupConfirm.html', { link }),
				i18n.t('_email.signupConfirm.text', { link }));

			if (ticket) {
				await this.registrationTicketsRepository.update(ticket.id, {
					usedAt: new Date(),
					pendingUserId: pendingUser.id,
				});
			}

			reply.code(204);
			return;
		} else {
			try {
				const { account, secret } = await this.signupService.signup({
					username, password, host,
					approved: !approvalRequiredForThisSignup,
					signupReason: approvalRequiredForThisSignup ? (reason ?? null) : undefined,
					emailLang,
				});

				if (ticket) {
					await this.registrationTicketsRepository.update(ticket.id, {
						usedAt: new Date(),
						usedBy: account,
						usedById: account.id,
					});
				}

				if (approvalRequiredForThisSignup) {
					const checkCode = await this.issueApprovalCheckCode(account.id);
					return { pendingApproval: true, checkCode } as const;
				}

				const res = await this.userEntityService.pack(account, account, {
					schema: 'MeDetailed',
					includeSecrets: true,
				});

				return {
					...res,
					token: secret,
				};
			} catch (err) {
				throw new FastifyReplyError(400, typeof err === 'string' ? err : (err as Error).toString());
			}
		}
	}

	@bindThis
	public async signupPending(request: FastifyRequest<{ Body: { code: string; } }>, reply: FastifyReply) {
		const body = request.body;

		const code = body['code'];

		try {
			const pendingUser = await this.userPendingsRepository.findOneByOrFail({ code });

			if (this.idService.parse(pendingUser.id).date.getTime() + (1000 * 60 * 30) < Date.now()) {
				throw new FastifyReplyError(400, 'EXPIRED');
			}

			const { approvalRequiredForSignup } = resolveSignupApprovalSettings(await this.juiceSettingsService.fetch());

			// 招待コードで登録した場合は承認式登録をバイパスする(招待した時点でモデレーターの信任があるため)
			const ticket = await this.registrationTicketsRepository.findOneBy({ pendingUserId: pendingUser.id });
			const approvalRequiredForThisSignup = approvalRequiredForSignup && ticket == null;

			const { account } = await this.signupService.signup({
				username: pendingUser.username,
				passwordHash: pendingUser.password,
				approved: !approvalRequiredForThisSignup,
				signupReason: approvalRequiredForThisSignup ? pendingUser.reason : undefined,
				emailLang: pendingUser.emailLang,
			});

			this.userPendingsRepository.delete({
				id: pendingUser.id,
			});

			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: account.id });

			await this.userProfilesRepository.update({ userId: profile.userId }, {
				email: pendingUser.email,
				emailVerified: true,
				emailVerifyCode: null,
			});

			if (ticket) {
				await this.registrationTicketsRepository.update(ticket.id, {
					usedBy: account,
					usedById: account.id,
					pendingUserId: null,
				});
			}

			if (approvalRequiredForThisSignup) {
				const lang = await this.emailI18nService.resolveLang(pendingUser.emailLang);
				const i18n = this.emailI18nService.getI18n(lang);
				this.emailService.sendEmail(pendingUser.email, i18n.t('_email.signupPendingApproval.subject'),
					i18n.t('_email.signupPendingApproval.html'),
					i18n.t('_email.signupPendingApproval.text'));

				const checkCode = await this.issueApprovalCheckCode(account.id);
				return { pendingApproval: true, checkCode } as const;
			}

			return this.signinService.signin(request, reply, account as MiLocalUser);
		} catch (err) {
			throw new FastifyReplyError(400, typeof err === 'string' ? err : (err as Error).toString());
		}
	}
}
