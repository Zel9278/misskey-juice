/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiNote } from '@/models/Note.js';
import type { Packed } from './json-schema.js';

// JUICE: ユーザーが設定した表示言語の絞り込み(filteredLanguages)。空なら絞り込み無し。
// ノート自身に言語が指定されていない場合は、絞り込みが有効(1つ以上選択済み)なときは
// 絞り込み対象(=非表示)にする。絞り込みが無効(空)なときのみ表示する。
// 純粋なリノート(自身のテキストを持たない)は、リノート元ノートの言語で判定する。
// Notes for future maintainers: この関数と同等の処理をQueryService.generateLanguageFilterQuery
// (SQL/TypeORMパス)にも実装している。この関数を変更した場合、そちらも変更する必要がある
export function isLanguageFiltered(note: Packed<'Note'> | MiNote, filteredLanguages: Set<string>): boolean {
	if (filteredLanguages.size === 0) return false;

	const lang = note.lang ?? note.renote?.lang ?? null;
	if (lang == null) return true;

	return !filteredLanguages.has(lang);
}
