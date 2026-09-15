/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
const address = new URL(window.document.querySelector<HTMLMetaElement>('meta[property="instance_url"]')?.content || window.location.href);
const siteName = window.document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content;

export const host = address.host;
export const hostname = address.hostname;
export const url = address.origin;
export const port = address.port;
export const apiUrl = window.location.origin + '/api';
export const wsOrigin = window.location.origin;
export const lang = localStorage.getItem('lang') ?? 'en-US';
export const langs = _LANGS_;
export const version = _VERSION_;
// JUICE: バージョン文字列(v)を "<Misskeyのベースバージョン>-juice+<JUICE独自のバージョン>" 形式で
// 分解する(例: "2026.9.0-juice+3.9" → { misskeyVersion: "2026.9.0", juiceVersion: "3.9" })。
// 更新通知ダイアログの新旧バージョン比較のように、現在のversion以外の文字列
// (localStorageに保存された前回のバージョン等)も同じ形式でパースしたい場面のために、
// 関数として切り出してある。この形式に一致しない場合(JUICEサフィックスの無いビルド等)は、
// misskeyVersionに引数全体を、juiceVersionにnullを設定する
export function parseJuiceVersion(v: string): { misskeyVersion: string; juiceVersion: string | null } {
	const match = /^(.+)-juice\+(.+)$/.exec(v);
	return { misskeyVersion: match?.[1] ?? v, juiceVersion: match?.[2] ?? null };
}
export const { misskeyVersion, juiceVersion } = parseJuiceVersion(version);
export const instanceName = (siteName === 'Misskey' || siteName == null) ? host : siteName;
export const ui = localStorage.getItem('ui');
export const debug = localStorage.getItem('debug') === 'true';
export const isSafeMode = localStorage.getItem('isSafeMode') === 'true';
export const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion)').matches;
