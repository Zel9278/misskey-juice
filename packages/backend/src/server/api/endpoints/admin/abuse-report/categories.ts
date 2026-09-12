/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveReportCategorySettings } from '@/models/JuiceSettings.js';

// JUICE: モデレーター(admin/juice/settingsはrequireAdminのため到達できない)が通報一覧の
// カテゴリラベル表示に使うための、無効化されたカテゴリも含む一覧取得専用エンドポイント
// (admin/contact-form/categoriesの通報版)
export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:abuse-user-reports',

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
			const { reportCategories } = resolveReportCategorySettings(await this.juiceSettingsService.fetch());
			return reportCategories.slice().sort((a, b) => a.order - b.order);
		});
	}
}
