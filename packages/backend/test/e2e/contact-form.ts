/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// How to run:
// pnpm jest -- e2e/contact-form.ts

// JUICE: お問い合わせフォーム機能(misskey-tempuraを参考に実装)のe2eテスト。
// 送信側(有効/無効・認証必須・カテゴリ・入力バリデーション)と、モデレーター向けCRUDの両方を検証する。
import * as assert from 'assert';
import { describe, beforeAll, test } from 'vitest';
import { SignupSuccessResponse } from 'misskey-js/entities.js';
import { successfulApiCall, failedApiCall, signup, role } from '../utils.js';

// JUICE: paramDefのminLength(20)を確実に満たす、十分な長さの本文
const validContent = 'お問い合わせ内容のテスト本文です。'.repeat(2);

describe('お問い合わせフォーム', () => {
	let root: SignupSuccessResponse;
	let alice: SignupSuccessResponse;
	let moderator: SignupSuccessResponse;

	beforeAll(async () => {
		root = await signup({ username: 'root' });
		alice = await signup();

		// JUICE: admin/contact-form/*はrequireModeratorだが、カテゴリ取得に使うadmin/juice/settingsは
		// requireAdminのため、管理者ではないモデレーターでも一覧・カテゴリ取得ができることを確認するために用意する
		moderator = await signup();
		const moderatorRole = await role(root, { isModerator: true, name: 'Contact Form Test Moderator Role' });
		await successfulApiCall({
			endpoint: 'admin/roles/assign',
			parameters: { userId: moderator.id, roleId: moderatorRole.id },
			user: root,
		}, { status: 204 });
	}, 1000 * 60 * 2);

	describe('送信', () => {
		test('無効化されていると送信できない', async () => {
			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { contactFormEnabled: false },
				user: root,
			}, { status: 204 });

			try {
				await failedApiCall({
					endpoint: 'contact-form/submit',
					parameters: {
						subject: 'テスト件名',
						content: validContent,
						replyMethod: 'email',
						email: 'test@example.com',
					},
					user: undefined,
				}, {
					status: 400,
					code: 'CONTACT_FORM_DISABLED',
					id: '097fc507-fbc9-4f8c-b565-f7d89d928c1e',
				});
			} finally {
				// JUICE: このテストが失敗しても、以降のテストへ設定が伝播しないよう必ず戻す
				await successfulApiCall({
					endpoint: 'admin/juice/update-settings',
					parameters: { contactFormEnabled: true },
					user: root,
				}, { status: 204 });
			}
		});

		test('認証を必須にすると未ログインでは送信できない', async () => {
			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { contactFormRequireAuth: true },
				user: root,
			}, { status: 204 });

			try {
				await failedApiCall({
					endpoint: 'contact-form/submit',
					parameters: {
						subject: 'テスト件名',
						content: validContent,
						replyMethod: 'email',
						email: 'test@example.com',
					},
					user: undefined,
				}, {
					status: 400,
					code: 'AUTH_REQUIRED',
					id: '1d6f0539-b4a3-4f9a-b8a6-9d55c36b0c86',
				});
			} finally {
				// JUICE: このテストが失敗しても、以降のテストへ設定が伝播しないよう必ず戻す
				await successfulApiCall({
					endpoint: 'admin/juice/update-settings',
					parameters: { contactFormRequireAuth: false },
					user: root,
				}, { status: 204 });
			}
		});

		test('未ログインでもメールアドレス返信で送信できる', async () => {
			const res = await successfulApiCall({
				endpoint: 'contact-form/submit',
				parameters: {
					subject: 'テスト件名',
					content: validContent,
					replyMethod: 'email',
					email: 'test@example.com',
				},
				user: undefined,
			});
			assert.notStrictEqual(res.id, undefined);
		});

		test('ログイン済みならMisskeyユーザー名返信で送信できる', async () => {
			const res = await successfulApiCall({
				endpoint: 'contact-form/submit',
				parameters: {
					subject: 'テスト件名2',
					content: validContent,
					replyMethod: 'misskey',
					misskeyUsername: `${alice.username}@misskey.local`,
				},
				user: alice,
			});
			assert.notStrictEqual(res.id, undefined);

			const shown = await successfulApiCall({
				endpoint: 'admin/contact-form/show',
				parameters: { contactFormId: res.id },
				user: root,
			});
			assert.strictEqual(shown.replyMethod, 'misskey');
			assert.strictEqual(shown.user?.id, alice.id);
			assert.strictEqual(shown.status, 'pending');
		});

		test('不正なメールアドレス形式は送信できない', async () => {
			await failedApiCall({
				endpoint: 'contact-form/submit',
				parameters: {
					subject: 'テスト件名',
					content: validContent,
					replyMethod: 'email',
					email: 'not-an-email',
				},
				user: undefined,
			}, {
				status: 400,
				code: 'INVALID_REPLY_METHOD',
				id: '010e1246-cf6d-424a-ae39-e11fab022594',
			});
		});

		test('存在しないカテゴリは送信できない', async () => {
			await failedApiCall({
				endpoint: 'contact-form/submit',
				parameters: {
					subject: 'テスト件名',
					content: validContent,
					replyMethod: 'email',
					email: 'test@example.com',
					category: 'no_such_category',
				},
				user: undefined,
			}, {
				status: 400,
				code: 'INVALID_REPLY_METHOD',
				id: '010e1246-cf6d-424a-ae39-e11fab022594',
			});
		});

		test('空白のみの本文は送信できない', async () => {
			await failedApiCall({
				endpoint: 'contact-form/submit',
				parameters: {
					subject: 'テスト件名',
					content: ' '.repeat(25),
					replyMethod: 'email',
					email: 'test@example.com',
				},
				user: undefined,
			}, {
				status: 400,
				code: 'INVALID_CONTENT',
				id: '88decb85-49b8-4813-b28c-b450ae87d8d5',
			});
		});
	});

	describe('モデレーターによる管理', () => {
		test('一覧・詳細・更新・削除ができる', async () => {
			const created = await successfulApiCall({
				endpoint: 'contact-form/submit',
				parameters: {
					subject: 'モデレーターテスト',
					content: validContent,
					replyMethod: 'email',
					email: 'moderator-test@example.com',
				},
				user: undefined,
			});

			const list = await successfulApiCall({
				endpoint: 'admin/contact-form/list',
				parameters: { status: 'pending' },
				user: root,
			});
			assert.ok(list.some(item => item.id === created.id));

			await successfulApiCall({
				endpoint: 'admin/contact-form/update',
				parameters: { contactFormId: created.id, status: 'resolved', adminNote: 'テストメモ' },
				user: root,
			}, { status: 204 });

			const shown = await successfulApiCall({
				endpoint: 'admin/contact-form/show',
				parameters: { contactFormId: created.id },
				user: root,
			});
			assert.strictEqual(shown.status, 'resolved');
			assert.strictEqual(shown.adminNote, 'テストメモ');

			await successfulApiCall({
				endpoint: 'admin/contact-form/delete',
				parameters: { contactFormId: created.id },
				user: root,
			}, { status: 204 });

			await failedApiCall({
				endpoint: 'admin/contact-form/show',
				parameters: { contactFormId: created.id },
				user: root,
			}, {
				status: 400,
				code: 'NO_SUCH_CONTACT_FORM',
				id: '757e3ac5-08d3-4ccc-8755-1d9973c4f39d',
			});
		});

		test('存在しないユーザーへの担当者割り当ては拒否される', async () => {
			const created = await successfulApiCall({
				endpoint: 'contact-form/submit',
				parameters: {
					subject: '担当者割り当てテスト',
					content: validContent,
					replyMethod: 'email',
					email: 'assign-test@example.com',
				},
				user: undefined,
			});

			await failedApiCall({
				endpoint: 'admin/contact-form/update',
				parameters: { contactFormId: created.id, assignedUserId: '000000000000000000000000' },
				user: root,
			}, {
				status: 400,
				code: 'NO_SUCH_USER',
				id: 'd5f2c579-8e1a-4c33-b48b-ac4ae7a625e7',
			});
		});

		test('一般ユーザーは管理エンドポイントを利用できない', async () => {
			await failedApiCall({
				endpoint: 'admin/contact-form/list',
				parameters: {},
				user: alice,
			}, {
				status: 403,
				code: 'ROLE_PERMISSION_DENIED',
				id: 'd33d5333-db36-423d-a8f9-1a2b9549da41',
			});
		});

		test('管理者ではないモデレーターでも、カテゴリ一覧(無効カテゴリ含む)を取得できる', async () => {
			// JUICE: admin/juice/settingsはrequireAdminのため、管理者ではないモデレーターでは
			// 到達できない(下のテストで確認)。カテゴリラベル解決・絞り込みのために
			// admin/contact-form/categoriesを別途requireModeratorで用意している
			const categories = await successfulApiCall({
				endpoint: 'admin/contact-form/categories',
				parameters: {},
				user: moderator,
			});
			assert.ok(categories.length > 0);

			await failedApiCall({
				endpoint: 'admin/juice/settings',
				parameters: {},
				user: moderator,
			}, {
				status: 403,
				code: 'ROLE_PERMISSION_DENIED',
				id: 'c3d38592-54c0-429d-be96-5636b0431a61',
			});
		});

		test('管理者ではないモデレーターでも一覧・詳細・更新・削除ができる', async () => {
			const created = await successfulApiCall({
				endpoint: 'contact-form/submit',
				parameters: {
					subject: 'モデレーター権限テスト',
					content: validContent,
					replyMethod: 'email',
					email: 'moderator-role-test@example.com',
				},
				user: undefined,
			});

			await successfulApiCall({
				endpoint: 'admin/contact-form/list',
				parameters: {},
				user: moderator,
			});

			await successfulApiCall({
				endpoint: 'admin/contact-form/update',
				parameters: { contactFormId: created.id, status: 'closed' },
				user: moderator,
			}, { status: 204 });

			await successfulApiCall({
				endpoint: 'admin/contact-form/delete',
				parameters: { contactFormId: created.id },
				user: moderator,
			}, { status: 204 });
		});
	});
});
