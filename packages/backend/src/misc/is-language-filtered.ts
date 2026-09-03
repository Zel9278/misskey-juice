/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiNote } from '@/models/Note.js';
import type { Packed } from './json-schema.js';

// JUICE: ユーザーが設定した表示言語の絞り込み(filteredLanguages)。空なら絞り込み無し。
// ノート自身に言語が指定されていない場合は常に表示する(Mastodonと同様の仕様)。
// 純粋なリノート(自身のテキストを持たない)は、リノート元ノートの言語で判定する。
// Notes for future maintainers: この関数と同等の処理をQueryService.generateLanguageFilterQuery
// (SQL/TypeORMパス)にも実装している。この関数を変更した場合、そちらも変更する必要がある
export function isLanguageFiltered(note: Packed<'Note'> | MiNote, filteredLanguages: Set<string>): boolean {
	if (filteredLanguages.size === 0) return false;

	const lang = note.lang ?? note.renote?.lang ?? null;
	if (lang == null) return false;

	return !filteredLanguages.has(lang);
}
