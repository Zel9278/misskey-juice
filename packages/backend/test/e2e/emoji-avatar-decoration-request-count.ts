/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// How to run:
// pnpm jest -- e2e/emoji-avatar-decoration-request-count.ts

// JUICE: 申請フォームで「あと何件申請できるか」を表示するためのemoji-requests/count・
// avatar-decoration-requests/countをe2eで検証する。作成・キャンセルに応じて審査待ち件数が
// 正しく増減することのみに絞る(上限自体のチェックはjuice-review-race-condition.ts等の既存
// テストで別途検証済み)。
import * as assert from 'assert';
import { describe, beforeAll, test } from 'vitest';
import { SignupSuccessResponse } from 'misskey-js/entities.js';
import { successfulApiCall, uploadFile, signup } from '../utils.js';

describe('絵文字・アバターデコレーション申請の審査待ち件数', () => {
	let root: SignupSuccessResponse;
	let alice: SignupSuccessResponse;

	beforeAll(async () => {
		root = await signup({ username: 'root' });
		alice = await signup();

		// JUICE: 絵文字申請・アバターデコレーション申請は既定で無効なので、テストのために有効化する
		await successfulApiCall({
			endpoint: 'admin/juice/update-settings',
			parameters: { emojiRequestEnabled: true, avatarDecorationRequestEnabled: true },
			user: root,
		}, { status: 204 });
	}, 1000 * 60 * 2);

	test('絵文字申請の作成・キャンセルに応じてpendingが増減する', async () => {
		const before = await successfulApiCall({
			endpoint: 'emoji-requests/count',
			parameters: {},
			user: alice,
		});

		const file = await uploadFile(alice);
		const request = await successfulApiCall({
			endpoint: 'emoji-requests/create',
			parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
			user: alice,
		});

		const afterCreate = await successfulApiCall({
			endpoint: 'emoji-requests/count',
			parameters: {},
			user: alice,
		});
		assert.strictEqual(afterCreate.pending, before.pending + 1);

		await successfulApiCall({
			endpoint: 'emoji-requests/cancel',
			parameters: { requestId: request.id },
			user: alice,
		}, { status: 204 });

		const afterCancel = await successfulApiCall({
			endpoint: 'emoji-requests/count',
			parameters: {},
			user: alice,
		});
		assert.strictEqual(afterCancel.pending, before.pending);
	});

	test('アバターデコレーション申請の作成・キャンセルに応じてpendingが増減する', async () => {
		const before = await successfulApiCall({
			endpoint: 'avatar-decoration-requests/count',
			parameters: {},
			user: alice,
		});

		const file = await uploadFile(alice);
		const request = await successfulApiCall({
			endpoint: 'avatar-decoration-requests/create',
			parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
			user: alice,
		});

		const afterCreate = await successfulApiCall({
			endpoint: 'avatar-decoration-requests/count',
			parameters: {},
			user: alice,
		});
		assert.strictEqual(afterCreate.pending, before.pending + 1);

		await successfulApiCall({
			endpoint: 'avatar-decoration-requests/cancel',
			parameters: { requestId: request.id },
			user: alice,
		}, { status: 204 });

		const afterCancel = await successfulApiCall({
			endpoint: 'avatar-decoration-requests/count',
			parameters: {},
			user: alice,
		});
		assert.strictEqual(afterCancel.pending, before.pending);
	});
});
