/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// How to run:
// pnpm jest -- e2e/juice-review-race-condition.ts

// JUICE: 絵文字申請・アバターデコレーション申請の承認/却下、および承認式新規登録の承認/却下について、
// 同一の申請/ユーザーに対して2つの審査リクエストが同時に処理されると両方とも成功してしまう
// (statusの読み取り→書き込みの間にロックが無い)TOCTOUを、条件付きUPDATE/DELETEで塞いだことを検証する。
import * as assert from 'assert';
import { describe, beforeAll, test } from 'vitest';
import { SignupSuccessResponse } from 'misskey-js/entities.js';
import { DataSource } from 'typeorm';
import { MiUser } from '@/models/User.js';
import { successfulApiCall, uploadFile, signup, initTestDb } from '../utils.js';

describe('審査系エンドポイントの競合状態', () => {
	let db: DataSource;
	let root: SignupSuccessResponse;
	let alice: SignupSuccessResponse;

	beforeAll(async () => {
		db = await initTestDb(true);
		root = await signup({ username: 'root' });
		alice = await signup();

		await successfulApiCall({
			endpoint: 'admin/juice/update-settings',
			parameters: { emojiRequestEnabled: true, avatarDecorationRequestEnabled: true },
			user: root,
		}, { status: 204 });
	}, 1000 * 60 * 2);

	test('絵文字申請を同時に2回却下しても、片方しか成功しない', async () => {
		const file = await uploadFile(alice);
		const request = await successfulApiCall({
			endpoint: 'emoji-requests/create',
			parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
			user: alice,
		});

		const [first, second] = await Promise.allSettled([
			successfulApiCall({
				endpoint: 'admin/emoji-requests/reject',
				parameters: { requestId: request.id, reason: '却下理由A' },
				user: root,
			}, { status: 204 }),
			successfulApiCall({
				endpoint: 'admin/emoji-requests/reject',
				parameters: { requestId: request.id, reason: '却下理由B' },
				user: root,
			}, { status: 204 }),
		]);

		const results = [first, second];
		const succeeded = results.filter(r => r.status === 'fulfilled');
		const failed = results.filter(r => r.status === 'rejected');
		assert.strictEqual(succeeded.length, 1, '同時に送った却下のうち、成功するのはちょうど1件のはず');
		assert.strictEqual(failed.length, 1);
	});

	test('アバターデコレーション申請を同時に2回却下しても、片方しか成功しない', async () => {
		const file = await uploadFile(alice);
		const request = await successfulApiCall({
			endpoint: 'avatar-decoration-requests/create',
			parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
			user: alice,
		});

		const [first, second] = await Promise.allSettled([
			successfulApiCall({
				endpoint: 'admin/avatar-decoration-requests/reject',
				parameters: { requestId: request.id, reason: '却下理由A' },
				user: root,
			}, { status: 204 }),
			successfulApiCall({
				endpoint: 'admin/avatar-decoration-requests/reject',
				parameters: { requestId: request.id, reason: '却下理由B' },
				user: root,
			}, { status: 204 }),
		]);

		const results = [first, second];
		const succeeded = results.filter(r => r.status === 'fulfilled');
		const failed = results.filter(r => r.status === 'rejected');
		assert.strictEqual(succeeded.length, 1, '同時に送った却下のうち、成功するのはちょうど1件のはず');
		assert.strictEqual(failed.length, 1);
	});

	test('承認式新規登録で、承認と却下を同時に送っても片方しか成功しない(承認済みアカウントが誤って削除されない)', async () => {
		const applicant = await signup();
		// JUICE: 承認式新規登録の申請フロー(captcha/招待コード等)一式を経由せず、
		// 「承認待ち(approved: false)」の状態を直接シードする
		await db.getRepository(MiUser).update(applicant.id, { approved: false });

		const [approveResult, declineResult] = await Promise.allSettled([
			successfulApiCall({
				endpoint: 'admin/juice/approve-signup',
				parameters: { userId: applicant.id },
				user: root,
			}, { status: 204 }),
			successfulApiCall({
				endpoint: 'admin/juice/decline-signup',
				parameters: { userId: applicant.id, reason: '却下理由' },
				user: root,
			}, { status: 204 }),
		]);

		const results = [approveResult, declineResult];
		const succeeded = results.filter(r => r.status === 'fulfilled');
		const failed = results.filter(r => r.status === 'rejected');
		assert.strictEqual(succeeded.length, 1, '承認・却下を同時に送っても、成功するのはちょうど1件のはず');
		assert.strictEqual(failed.length, 1);

		// 承認が勝った場合はユーザーが残って approved: true、却下が勝った場合はユーザーごと削除されているはず。
		// admin/show-user等のAPI越しではなく、DBを直接見て検証する(却下時に user 行ごと削除されるため)
		const userRow = await db.getRepository(MiUser).findOneBy({ id: applicant.id });
		if (approveResult.status === 'fulfilled') {
			assert.notStrictEqual(userRow, null);
			assert.strictEqual(userRow!.approved, true);
		} else {
			assert.strictEqual(userRow, null);
		}
	});
});
