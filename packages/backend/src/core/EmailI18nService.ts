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

// システムメール本文をユーザーごとの言語で組み立てるためのヘルパー(JUICE)。
// packages/i18n の locales はビルド時に ja-JP の内容を全言語のフォールバックとして
// マージ済みなので、翻訳が存在しないキー・言語でも ja-JP の内容がそのまま返る。
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
		return new I18n(locales[lang] ?? locales['ja-JP']);
	}
}
