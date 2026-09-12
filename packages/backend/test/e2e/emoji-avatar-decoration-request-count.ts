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
		// JUICE: peekUsage()はlimit()と異なりNODE_ENV!=='production'でも早期returnしない
		// (dev環境でもUI表示を確認できるようにするため)ため、テスト環境でも数値が返る。
		// 一方、実際のレート制限適用(limit())自体はテスト環境では無効(RateLimiterService.disabled)
		// なため、emoji-requests/create等の呼び出しではZSETへの書き込み(消費)が発生せず、
		// 既定値(emojiRequestDailyLimit=5)のまま変化しない。ZSETに実績が一切無いため、
		// 次に枠が空く日時(dailyResetAt)もnullのまま
		assert.strictEqual(before.dailyRemaining, 5);
		assert.strictEqual(before.dailyResetAt, null);

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
		// JUICE: peekUsage()はlimit()と異なりNODE_ENV!=='production'でも早期returnしない
		// (dev環境でもUI表示を確認できるようにするため)ため、テスト環境でも数値が返る。
		// 一方、実際のレート制限適用(limit())自体はテスト環境では無効(RateLimiterService.disabled)
		// なため、avatar-decoration-requests/create等の呼び出しではZSETへの書き込み(消費)が
		// 発生せず、既定値(avatarDecorationRequestDailyLimit=5)のまま変化しない。ZSETに実績が
		// 一切無いため、次に枠が空く日時(dailyResetAt)もnullのまま
		assert.strictEqual(before.dailyRemaining, 5);
		assert.strictEqual(before.dailyResetAt, null);

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
