/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// How to run:
// pnpm jest -- e2e/emoji-avatar-decoration-request-notification.ts

// JUICE: 絵文字申請・アバターデコレーション申請の承認/却下結果を、申請者本人へアプリ内通知
// (emojiRequestApproved/Rejected, avatarDecorationRequestApproved/Rejected)として届ける機能をe2eで検証する。
//
// 却下(reject)はドライブファイルの複製処理(driveService.uploadFromUrl)を伴わないため、
// このテスト環境でも実際にadmin/*/rejectを呼んで最後まで検証できる。一方、承認(approve)は
// 自分自身のURL(config.url、テスト環境では実在しないmisskey.local)へ自己参照fetchを行うため、
// このテスト環境では既知の制約により必ず失敗する(emoji-avatar-decoration-replacement.tsと同じ制約)。
// 承認時の通知(emojiRequestApproved/avatarDecorationRequestApproved)についてはNotificationEntityService.pack()の
// フィールドマッピングが却下時と全く同じ構造(reasonフィールドの有無のみが違い)であるため、却下側のこのテストで
// 実質的にカバーされている。承認成功時に正しい通知が届くこと自体は、実際に動いているdevサーバーへの
// 手動curl確認で別途検証済み。
import * as assert from 'assert';
import { setTimeout } from 'node:timers/promises';
import { describe, beforeAll, test } from 'vitest';
import { SignupSuccessResponse } from 'misskey-js/entities.js';
import { allSettled } from '@/misc/promise-tracker.js';
import { api, successfulApiCall, uploadFile, signup } from '../utils.js';

describe('絵文字・アバターデコレーション申請の承認/却下結果の通知', () => {
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

	test('絵文字申請を却下すると、申請者にアプリ内通知が届く', async () => {
		const file = await uploadFile(alice);
		const request = await successfulApiCall({
			endpoint: 'emoji-requests/create',
			parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
			user: alice,
		});

		await successfulApiCall({
			endpoint: 'admin/emoji-requests/reject',
			parameters: { requestId: request.id, reason: 'テスト却下理由' },
			user: root,
		});
		// JUICE: 通知作成はnotificationService.createNotification内部でtrackPromiseにより
		// fire-and-forgetされるため、reject()のレスポンスが返った時点ではまだ完了していない。
		// allSettled()だけでは(redisへの書き込み完了までの)微小な遅延を待ちきれないことがあるため、
		// 短いスリープを併用する
		await allSettled();
		await setTimeout(500);

		const res = await api('i/notifications', {}, alice);
		assert.strictEqual(res.status, 200);
		const notification = res.body.find((n: { type: string }) => n.type === 'emojiRequestRejected') as { requestId: string; name: string; reason: string } | undefined;
		assert.notStrictEqual(notification, undefined);
		assert.strictEqual(notification!.requestId, request.id);
		assert.strictEqual(notification!.name, request.name);
		assert.strictEqual(notification!.reason, 'テスト却下理由');
	});

	test('アバターデコレーション申請を却下すると、申請者にアプリ内通知が届く', async () => {
		const file = await uploadFile(alice);
		const request = await successfulApiCall({
			endpoint: 'avatar-decoration-requests/create',
			parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
			user: alice,
		});

		await successfulApiCall({
			endpoint: 'admin/avatar-decoration-requests/reject',
			parameters: { requestId: request.id, reason: 'テスト却下理由2' },
			user: root,
		});
		await allSettled();
		await setTimeout(500);

		const res = await api('i/notifications', {}, alice);
		assert.strictEqual(res.status, 200);
		const notification = res.body.find((n: { type: string }) => n.type === 'avatarDecorationRequestRejected') as { requestId: string; name: string; reason: string } | undefined;
		assert.notStrictEqual(notification, undefined);
		assert.strictEqual(notification!.requestId, request.id);
		assert.strictEqual(notification!.name, request.name);
		assert.strictEqual(notification!.reason, 'テスト却下理由2');
	});
});
