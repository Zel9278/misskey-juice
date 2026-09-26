/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: ページのヘッダーのボタンはアイコンだけで、狭い画面(スマホ等)ではツールチップも出ないため何のボタンか分からない。
// 狭いときは1つの「…」ボタンにまとめ、押すと名前付きのメニューで選べるようにする

import type { PageHeaderItem } from '@/types/page-header.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

export function collapseHeaderActions(actions: PageHeaderItem[], collapse: boolean): PageHeaderItem[] {
	if (!collapse || actions.length === 0) return actions;
	return [{
		icon: 'ti ti-dots',
		text: i18n.ts.menu,
		handler: (ev) => {
			// メニューから選んだ後も、元のボタンの位置にポップアップを出せるよう、押したときのイベントをそのまま渡す
			os.popupMenu(actions.map(action => ({
				text: action.text ?? '',
				icon: action.icon,
				danger: action.danger,
				action: () => action.handler(ev),
			})), ev.currentTarget ?? ev.target);
		},
	}];
}
