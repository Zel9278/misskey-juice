/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// How to run:
// pnpm jest -- e2e/emoji-avatar-decoration-request-cancel.ts

// JUICE: 絵文字申請・アバターデコレーション申請を、審査待ちの間に申請者自身がキャンセル(取り下げ)できる
// emoji-requests/cancel・avatar-decoration-requests/cancelをe2eで検証する。同時キャンセル・却下の
// レース(TOCTOU)についてはjuice-review-race-condition.tsで別途検証しているため、ここでは
// 正常系(status遷移)・所有権チェック・審査済み申請への操作拒否の3点に絞る。
import * as assert from 'assert';
import { describe, beforeAll, test } from 'vitest';
import { SignupSuccessResponse } from 'misskey-js/entities.js';
import { successfulApiCall, failedApiCall, uploadFile, signup } from '../utils.js';

describe('絵文字・アバターデコレーション申請のキャンセル', () => {
	let root: SignupSuccessResponse;
	let alice: SignupSuccessResponse;
	let bob: SignupSuccessResponse;

	beforeAll(async () => {
		root = await signup({ username: 'root' });
		alice = await signup();
		bob = await signup();

		// JUICE: 絵文字申請・アバターデコレーション申請は既定で無効なので、テストのために有効化する
		await successfulApiCall({
			endpoint: 'admin/juice/update-settings',
			parameters: { emojiRequestEnabled: true, avatarDecorationRequestEnabled: true },
			user: root,
		}, { status: 204 });
	}, 1000 * 60 * 2);

	describe('絵文字申請', () => {
		test('審査待ちの間、申請者自身でキャンセルできる', async () => {
			const file = await uploadFile(alice);
			const request = await successfulApiCall({
				endpoint: 'emoji-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
				user: alice,
			});

			await successfulApiCall({
				endpoint: 'emoji-requests/cancel',
				parameters: { requestId: request.id },
				user: alice,
			}, { status: 204 });

			const list = await successfulApiCall({
				endpoint: 'emoji-requests/list',
				parameters: { status: 'cancelled' },
				user: alice,
			});
			assert.ok(list.some(r => r.id === request.id));
		});

		test('他人の申請はキャンセルできない', async () => {
			const file = await uploadFile(alice);
			const request = await successfulApiCall({
				endpoint: 'emoji-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
				user: alice,
			});

			await failedApiCall({
				endpoint: 'emoji-requests/cancel',
				parameters: { requestId: request.id },
				user: bob,
			}, { status: 400, code: 'NO_SUCH_REQUEST', id: '32f83001-01cd-45a6-bc2e-6ad28f7599cb' });
		});

		test('既に却下済みの申請はキャンセルできない', async () => {
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
			}, { status: 204 });

			await failedApiCall({
				endpoint: 'emoji-requests/cancel',
				parameters: { requestId: request.id },
				user: alice,
			}, { status: 400, code: 'ALREADY_REVIEWED', id: '7b5306b9-dd3d-453f-89cb-3152cb8388c5' });
		});
	});

	describe('アバターデコレーション申請', () => {
		test('審査待ちの間、申請者自身でキャンセルできる', async () => {
			const file = await uploadFile(alice);
			const request = await successfulApiCall({
				endpoint: 'avatar-decoration-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
				user: alice,
			});

			await successfulApiCall({
				endpoint: 'avatar-decoration-requests/cancel',
				parameters: { requestId: request.id },
				user: alice,
			}, { status: 204 });

			const list = await successfulApiCall({
				endpoint: 'avatar-decoration-requests/list',
				parameters: { status: 'cancelled' },
				user: alice,
			});
			assert.ok(list.some(r => r.id === request.id));
		});

		test('他人の申請はキャンセルできない', async () => {
			const file = await uploadFile(alice);
			const request = await successfulApiCall({
				endpoint: 'avatar-decoration-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
				user: alice,
			});

			await failedApiCall({
				endpoint: 'avatar-decoration-requests/cancel',
				parameters: { requestId: request.id },
				user: bob,
			}, { status: 400, code: 'NO_SUCH_REQUEST', id: '2a23b8eb-1456-45a6-b99a-eefc30563190' });
		});

		test('既に却下済みの申請はキャンセルできない', async () => {
			const file = await uploadFile(alice);
			const request = await successfulApiCall({
				endpoint: 'avatar-decoration-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
				user: alice,
			});

			await successfulApiCall({
				endpoint: 'admin/avatar-decoration-requests/reject',
				parameters: { requestId: request.id, reason: 'テスト却下理由' },
				user: root,
			}, { status: 204 });

			await failedApiCall({
				endpoint: 'avatar-decoration-requests/cancel',
				parameters: { requestId: request.id },
				user: alice,
			}, { status: 400, code: 'ALREADY_REVIEWED', id: '9bbe4269-34c7-4cd5-8878-be00790ec54c' });
		});
	});
});
