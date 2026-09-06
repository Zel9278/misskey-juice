/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// How to run:
// pnpm jest -- e2e/notes-search.ts

import * as assert from 'assert';
import { describe, beforeAll, test } from 'vitest';
import { SignupSuccessResponse } from 'misskey-js/entities.js';
import { api, post, role, signup } from '../utils.js';

describe('notes/search', () => {
	let root: SignupSuccessResponse;
	let alice: SignupSuccessResponse;

	beforeAll(async () => {
		root = await signup({ username: 'root' });
		alice = await signup();

		// JUICE: notes/searchはcanSearchNotesロールポリシー(既定false)が必要
		const searchRole = await role(root, {}, {
			canSearchNotes: { priority: 0, useDefault: false, value: true },
		});

		await api('admin/roles/assign', { userId: alice.id, roleId: searchRole.id }, root);
	}, 1000 * 60 * 2);

	// JUICE: ノートの言語(BCP 47言語タグ)での絞り込み
	describe('言語フィルタ', () => {
		test('lang指定時、一致する言語の投稿のみが含まれる', async () => {
			const keyword = `langsearch${Date.now()}`;
			const jaNote = await post(alice, { text: `${keyword} こんにちは`, lang: 'ja-JP' });
			const enNote = await post(alice, { text: `${keyword} hello`, lang: 'en-US' });
			const noLangNote = await post(alice, { text: `${keyword} no lang` });

			const res = await api('notes/search', {
				query: keyword,
				lang: 'ja-JP',
				limit: 20,
			}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === jaNote.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === enNote.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === noLangNote.id), false);
		});

		test('lang未指定時、言語を問わずすべて含まれる', async () => {
			const keyword = `langsearch${Date.now()}`;
			const jaNote = await post(alice, { text: `${keyword} こんにちは`, lang: 'ja-JP' });
			const enNote = await post(alice, { text: `${keyword} hello`, lang: 'en-US' });

			const res = await api('notes/search', {
				query: keyword,
				limit: 20,
			}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === jaNote.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === enNote.id), true);
		});
	});
});
