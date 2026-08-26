/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import locales from 'i18n';
import type { Locale } from 'i18n';
import { I18n } from '@/misc/i18n.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveEmailSettings } from '@/models/JuiceSettings.js';
import { bindThis } from '@/decorators.js';

// システムメール本文で使う `_email.*` テンプレートは ja-JP.yml にしか書かれておらず、
// 他言語 (en-US.yml 等) は Crowdin 管理下で手動編集禁止 (locales/README.md) のため、
// packages/i18n のビルド時マージにより翻訳が無いキー・言語は当面すべて ja-JP の内容
// (日本語) がそのまま返ってしまう。日本語が読めないユーザーには不親切なので、JUICE側
// で英訳を持っておき、ja-JP 以外が選択された場合はこちらを優先する。
// 将来 Crowdin で `_email.*` が実際に翻訳されたら、この英訳は撤去して packages/i18n
// 側の翻訳にそのまま委ねてよい。
// ParameterizedString はプレースホルダー名をコンパイル時に検査するためのブランド型で、
// YAML から自動生成される packages/i18n の値以外は普通の string として構築するしかない
// ため、ここでは末尾で Partial<Locale['_email']> にアサーションする
const emailFallbackLocaleEnUS = {
	resetPassword: {
		subject: 'Password reset request',
		html: 'To reset your password, please click this link:<br><a href="{link}">{link}</a>',
		text: 'To reset your password, please click this link: {link}',
	},
	verifyEmail: {
		subject: 'Confirm your email address',
		html: 'To verify your email address, please click this link:<br><a href="{link}">{link}</a>',
		text: 'To verify your email address, please click this link: {link}',
	},
	signupConfirm: {
		subject: 'Confirm your registration',
		html: 'To complete your registration, please click this link:<br><a href="{link}">{link}</a>',
		text: 'To complete your registration, please click this link: {link}',
	},
	signupPendingApproval: {
		subject: 'Your registration is pending approval',
		html: 'Thank you for signing up. You won\'t be able to sign in until an administrator approves your account. We\'ll email you once a decision has been made.',
		text: 'Thank you for signing up. You won\'t be able to sign in until an administrator approves your account. We\'ll email you once a decision has been made.',
	},
	signupApproved: {
		subject: 'Your registration has been approved',
		html: 'Your account registration has been approved. You can now sign in.',
		text: 'Your account registration has been approved. You can now sign in.',
	},
	signupDeclined: {
		subject: 'Your registration has been declined',
		html: 'Your account registration request has been declined.',
		text: 'Your account registration request has been declined.',
	},
	newLogin: {
		subject: 'New sign-in detected',
		html: 'A new sign-in to your account was detected. If this wasn\'t you, please update your account security, such as changing your password.',
		text: 'A new sign-in to your account was detected. If this wasn\'t you, please update your account security, such as changing your password.',
	},
	accountDeleted: {
		subject: 'Your account has been deleted',
		html: 'Your account has been deleted.',
		text: 'Your account has been deleted.',
	},
	moderatorInactivity: {
		subject: 'Moderator inactivity notice',
		htmlDays: 'Dear moderators,<br><br>It looks like no moderator has been active for a while. If this continues for {days} more day(s), this server will switch to invite-only mode.<br>If you don\'t want that to happen, please sign in to Misskey to update your last-active time.',
		textDays: 'Dear moderators,\n\nIt looks like no moderator has been active for a while. If this continues for {days} more day(s), this server will switch to invite-only mode.\nIf you don\'t want that to happen, please sign in to Misskey to update your last-active time.',
		htmlHours: 'Dear moderators,<br><br>It looks like no moderator has been active for a while. If this continues for {hours} more hour(s), this server will switch to invite-only mode.<br>If you don\'t want that to happen, please sign in to Misskey to update your last-active time.',
		textHours: 'Dear moderators,\n\nIt looks like no moderator has been active for a while. If this continues for {hours} more hour(s), this server will switch to invite-only mode.\nIf you don\'t want that to happen, please sign in to Misskey to update your last-active time.',
	},
	invitationOnlyChanged: {
		subject: 'Switched to invite-only mode',
		html: 'Dear moderators,<br><br>No moderator activity was detected for {days} day(s), so this server has been switched to invite-only mode.<br>To turn invite-only mode off, please access the control panel.',
		text: 'Dear moderators,\n\nNo moderator activity was detected for {days} day(s), so this server has been switched to invite-only mode.\nTo turn invite-only mode off, please access the control panel.',
	},
	newAbuseReport: {
		subject: 'New report received',
	},
} as Partial<Locale['_email']>;

@Injectable()
export class EmailI18nService {
	constructor(
		private juiceSettingsService: JuiceSettingsService,
	) {
	}

	// 引数の明示的な言語指定 (UserProfile.emailLang 等) が無ければ、
	// インスタンス既定の言語 (JuiceSettings.defaultEmailLang) にフォールバックする
	@bindThis
	public async resolveLang(explicitLang?: string | null): Promise<string> {
		if (explicitLang) return explicitLang;
		const { defaultEmailLang } = resolveEmailSettings(await this.juiceSettingsService.fetch());
		return defaultEmailLang;
	}

	@bindThis
	public getI18n(lang: string): I18n<Locale> {
		const base = locales[lang] ?? locales['ja-JP'];

		if (lang === 'ja-JP') return new I18n(base);

		return new I18n({
			...base,
			_email: {
				...base._email,
				...emailFallbackLocaleEnUS,
			},
		});
	}
}
