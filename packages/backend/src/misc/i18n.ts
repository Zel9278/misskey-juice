/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { escapeHtml } from '@/misc/escape-html.js';

export class I18n<T extends Record<string, any>> {
	public locale: T;

	constructor(locale: T) {
		this.locale = locale;

		//#region BIND
		//this.t = this.t.bind(this);
		//#endregion
	}

	// string にしているのは、ドット区切りでのパス指定を許可するため
	// なるべくこのメソッド使うよりもlocale直接参照の方がvueのキャッシュ効いてパフォーマンスが良いかも
	public t(key: string, args?: Record<string, any>): string {
		try {
			let str = key.split('.').reduce((o, i) => o[i], this.locale as any) as string;

			if (args) {
				// JUICE: このメソッドはHTMLメール本文のテンプレート(`_email.*.html`等)にも使われており、
				// 却下理由・申請名など利用者が自由入力した値がそのまま埋め込まれるとHTMLインジェクションになる。
				// キー末尾セグメントが`html`始まり(html/htmlDays/htmlHours等)のときだけ値をエスケープし、
				// テキストメール用の`text`系キーはそのまま(エスケープ不要)にする
				const isHtml = (key.split('.').pop() ?? '').startsWith('html');
				for (const [k, v] of Object.entries(args)) {
					str = str.replaceAll(`{${k}}`, isHtml ? escapeHtml(String(v)) : String(v));
				}
			}
			return str;
		} catch (_) {
			console.warn(`missing localization '${key}'`);
			return key;
		}
	}
}
