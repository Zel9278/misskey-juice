/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveContactFormSettings } from '@/models/JuiceSettings.js';

// JUICE: モデレーター(admin/juice/settingsはrequireAdminのため到達できない)がお問い合わせ一覧の
// カテゴリ絞り込み・ラベル表示に使うための、無効化されたカテゴリも含む一覧取得専用エンドポイント
export const meta = {
	tags: ['admin'],
	requireCredential: true,
	// JUICE: カテゴリのキー・表示名自体はPIIではないため、他のお問い合わせ管理エンドポイントと同じくモデレーターまで許可する
	requireModerator: true,
	kind: 'read:admin:contact-form',
	secure: true,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				key: { type: 'string', optional: false, nullable: false },
				text: { type: 'string', optional: false, nullable: false },
				enabled: { type: 'boolean', optional: false, nullable: false },
				order: { type: 'number', optional: false, nullable: false },
				isDefault: { type: 'boolean', optional: false, nullable: false },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private juiceSettingsService: JuiceSettingsService,
	) {
		super(meta, paramDef, async () => {
			const { contactFormCategories } = resolveContactFormSettings(await this.juiceSettingsService.fetch());
			return contactFormCategories.slice().sort((a, b) => a.order - b.order);
		});
	}
}
