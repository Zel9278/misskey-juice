/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { misskeyApi } from '@/utility/misskey-api.js';

// MkMfm.ts(h()ベースの関数コンポーネント)からノートの数式ノードごとに
// 呼ばれうるため、リクエストをプロセス内で1回に集約するモジュール単位キャッシュ。
let cache: Promise<boolean> | null = null;

export function fetchJuiceLatexEnabled(): Promise<boolean> {
	cache ??= misskeyApi('juice/public-settings').then(res => res.latexEnabled).catch(() => false);
	return cache;
}
