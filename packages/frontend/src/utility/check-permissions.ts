/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { instance } from '@/instance.js';
import { $i } from '@/i.js';

export const notesSearchAvailable = (
	// FIXME: instance.policies would be null in Vitest
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	($i == null && instance.policies != null && instance.policies.canSearchNotes) ||
	($i != null && $i.policies.canSearchNotes) ||
	false
) as boolean;

export const canSearchNonLocalNotes = (
	instance.noteSearchableScope === 'global'
);

export const usersSearchAvailable = (
	// FIXME: instance.policies would be null in Vitest
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	($i == null && instance.policies != null && instance.policies.canSearchUsers) ||
	($i != null && $i.policies.canSearchUsers) ||
	false
);

// JUICE: 自分自身のリアクションを対象とする検索のため、ログインしていることが必須。
// 内部的にはnotes/searchエンドポイントを使うため、ノート検索自体の権限も併せて確認する
export const myReactionSearchAvailable = (
	$i != null && notesSearchAvailable
) as boolean;
