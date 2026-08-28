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
	/** ユーザーがメール言語を選択・保存していない場合に、システムメールで使う既定の言語 */
	defaultEmailLang?: string;
	/** 絵文字申請機能を有効にするか */
	emojiRequestEnabled?: boolean;
	/** ユーザーランキングの集計期間(時間単位) */
	rankingAggregationPeriodHours?: number;
	/** リレーTL機能を有効にするか */
	relayTimelineEnabled?: boolean;
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

/**
 * jsonb には存在しないキーがありうるため、デフォルト値を解決してから返す。
 * admin/juice/settings・EmailI18nService の2箇所で共通利用する。
 */
export function resolveEmailSettings(settings: JuiceSettingsValue): {
	defaultEmailLang: string;
} {
	return {
		defaultEmailLang: settings.defaultEmailLang ?? 'ja-JP',
	};
}

/**
 * jsonb には存在しないキーがありうるため、デフォルト値を解決してから返す。
 * admin/juice/settings・juice/public-settings・emoji-requests/*の4箇所で共通利用する。
 */
export function resolveEmojiRequestSettings(settings: JuiceSettingsValue): {
	emojiRequestEnabled: boolean;
} {
	return {
		emojiRequestEnabled: settings.emojiRequestEnabled ?? false,
	};
}

/**
 * jsonb には存在しないキーがありうるため、デフォルト値を解決してから返す。
 * admin/juice/settings・JuiceUserRankingServiceの2箇所で共通利用する。
 */
export function resolveRankingSettings(settings: JuiceSettingsValue): {
	rankingAggregationPeriodHours: number;
} {
	return {
		rankingAggregationPeriodHours: settings.rankingAggregationPeriodHours ?? 12,
	};
}

/**
 * jsonb には存在しないキーがありうるため、デフォルト値を解決してから返す。
 * admin/juice/settings・juice/public-settings・notes/relay-timeline・stream/relay-timelineの4箇所で共通利用する。
 */
export function resolveRelayTimelineSettings(settings: JuiceSettingsValue): {
	relayTimelineEnabled: boolean;
} {
	return {
		relayTimelineEnabled: settings.relayTimelineEnabled ?? false,
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
