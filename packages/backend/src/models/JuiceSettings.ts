/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, PrimaryColumn, Column } from 'typeorm';

// JUICE 独自機能の設定はここに集約する。各機能を実装するたびにフィールドを追加していく。
// 個別のマイグレーションを増やさないよう、単一の jsonb カラムにまとめている。
export interface JuiceSettingsValue {
	/** 承認式新規登録を有効にするか */
	approvalRequiredForSignup?: boolean;
	/** 承認式新規登録が有効な場合、登録理由の入力を必須にするか */
	signupReasonRequired?: boolean;
	/** 登録理由の最大文字数 */
	signupReasonMaxLength?: number;
}

/**
 * jsonb には存在しないキーがありうるため、デフォルト値を解決してから返す。
 * admin/juice/settings・juice/public-settings・SignupApiService の3箇所で共通利用する。
 */
export function resolveSignupApprovalSettings(settings: JuiceSettingsValue): {
	approvalRequiredForSignup: boolean;
	signupReasonRequired: boolean;
	signupReasonMaxLength: number;
} {
	return {
		approvalRequiredForSignup: settings.approvalRequiredForSignup ?? false,
		signupReasonRequired: settings.signupReasonRequired ?? true,
		signupReasonMaxLength: settings.signupReasonMaxLength ?? 4096,
	};
}

@Entity('juice_settings')
export class MiJuiceSettings {
	@PrimaryColumn('varchar', {
		length: 32,
	})
	public id: string;

	@Column('jsonb', {
		default: {},
	})
	public settings: JuiceSettingsValue;

	constructor(data: Partial<MiJuiceSettings>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}
