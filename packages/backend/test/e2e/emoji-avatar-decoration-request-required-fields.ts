/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// How to run:
// pnpm jest -- e2e/emoji-avatar-decoration-request-required-fields.ts

// JUICE: 絵文字申請・アバターデコレーション申請フォームで、名前以外のどの入力を必須にするかを
// 管理者設定で切り替えられる機能をe2eで検証する。既定はすべて任意で、有効にした場合のみ
// 未入力を拒否すること・差し替え申請(targetEmojiId等指定時)はこれらのフィールド自体を
// 使わないため対象外になることを確認する。
//
// 差し替え申請の前提となる「承認済みの申請から作られた絵文字/デコレーション」は、
// admin/*-requests/approveを実際に呼ぶ代わりにDBへ直接シードする
// (emoji-avatar-decoration-replacement.tsと同じ理由: 承認処理は申請者のDriveファイルを
// システム所有として複製する際にconfig.url(テスト環境では実在しないmisskey.local)への
// 自己参照fetchを行うため、このテスト環境では既知の制約により必ず失敗する)。
import * as assert from 'assert';
import { describe, beforeAll, afterAll, test } from 'vitest';
import { SignupSuccessResponse } from 'misskey-js/entities.js';
import { DataSource } from 'typeorm';
import { MiEmoji } from '@/models/Emoji.js';
import { MiEmojiRequest } from '@/models/EmojiRequest.js';
import { MiAvatarDecoration } from '@/models/AvatarDecoration.js';
import { MiAvatarDecorationRequest } from '@/models/AvatarDecorationRequest.js';
import { IdService } from '@/core/IdService.js';
import { loadConfig } from '@/config.js';
import { successfulApiCall, failedApiCall, uploadFile, signup, initTestDb } from '../utils.js';

const idService = new IdService(loadConfig());

describe('絵文字・アバターデコレーション申請の必須項目設定', () => {
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

	// JUICE: 承認済みの絵文字申請(=絵文字が実際に作られている状態)をDBへ直接シードする
	async function seedApprovedEmojiRequest(user: SignupSuccessResponse, name: string) {
		const emojiId = idService.gen();
		await db.getRepository(MiEmoji).insert({
			id: emojiId,
			name,
			host: null,
			originalUrl: 'https://example.com/dummy.png',
			publicUrl: 'https://example.com/dummy.png',
			aliases: [],
			roleIdsThatCanBeUsedThisEmojiAsReaction: [],
		});
		await db.getRepository(MiEmojiRequest).insert({
			id: idService.gen(),
			userId: user.id,
			name,
			aliases: [],
			status: 'approved',
			resultEmojiId: emojiId,
			deleteFileAfterReview: false,
		});
		return emojiId;
	}

	// JUICE: 承認済みのアバターデコレーション申請をDBへ直接シードする
	async function seedApprovedAvatarDecorationRequest(user: SignupSuccessResponse, name: string) {
		const decorationId = idService.gen();
		await db.getRepository(MiAvatarDecoration).insert({
			id: decorationId,
			name,
			description: '',
			url: 'https://example.com/dummy.png',
			roleIdsThatCanBeUsedThisDecoration: [],
		});
		await db.getRepository(MiAvatarDecorationRequest).insert({
			id: idService.gen(),
			userId: user.id,
			name,
			description: '',
			status: 'approved',
			resultAvatarDecorationId: decorationId,
			deleteFileAfterReview: false,
		});
		return decorationId;
	}

	afterAll(async () => {
		// JUICE: 他のテストファイルに影響しないよう、既定値(すべて任意)に戻す
		await successfulApiCall({
			endpoint: 'admin/juice/update-settings',
			parameters: {
				emojiRequestRequireCategory: false,
				emojiRequestRequireTags: false,
				emojiRequestRequireLicense: false,
				avatarDecorationRequestRequireCategory: false,
				avatarDecorationRequestRequireDescription: false,
			},
			user: root,
		}, { status: 204 });
	});

	describe('絵文字申請', () => {
		test('既定(すべて任意)では、名前だけで申請できる', async () => {
			const file = await uploadFile(alice);
			await successfulApiCall({
				endpoint: 'emoji-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
				user: alice,
			});
		});

		test('カテゴリを必須にすると、未入力の申請は拒否される', async () => {
			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { emojiRequestRequireCategory: true },
				user: root,
			}, { status: 204 });

			const file = await uploadFile(alice);
			await failedApiCall({
				endpoint: 'emoji-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
				user: alice,
			}, { status: 400, code: 'CATEGORY_REQUIRED', id: '6f8a5c8e-3a89-4f16-8b1a-1e5f6c8d3a2b' });

			// カテゴリを入れれば通る
			await successfulApiCall({
				endpoint: 'emoji-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}`, category: 'テスト' },
				user: alice,
			});

			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { emojiRequestRequireCategory: false },
				user: root,
			}, { status: 204 });
		});

		test('タグを必須にすると、未入力の申請は拒否される(create-manyでも同様)', async () => {
			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { emojiRequestRequireTags: true },
				user: root,
			}, { status: 204 });

			const file = await uploadFile(alice);
			await failedApiCall({
				endpoint: 'emoji-requests/create-many',
				parameters: { requests: [{ fileId: file.body!.id, name: `dummy_${Date.now()}` }] },
				user: alice,
			}, { status: 400, code: 'TAGS_REQUIRED', id: 'a0ce9fd1-7ecd-4d5a-cf5e-5c9d0fc17e6f' });

			await successfulApiCall({
				endpoint: 'emoji-requests/create-many',
				parameters: { requests: [{ fileId: file.body!.id, name: `dummy_${Date.now()}`, aliases: ['test'] }] },
				user: alice,
			});

			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { emojiRequestRequireTags: false },
				user: root,
			}, { status: 204 });
		});

		test('ライセンスを必須にすると、未入力の申請は拒否される', async () => {
			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { emojiRequestRequireLicense: true },
				user: root,
			}, { status: 204 });

			const file = await uploadFile(alice);
			await failedApiCall({
				endpoint: 'emoji-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
				user: alice,
			}, { status: 400, code: 'LICENSE_REQUIRED', id: '8dac7eaf-5cab-4b38-ad3c-3a7b8eaf5c4d' });

			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { emojiRequestRequireLicense: false },
				user: root,
			}, { status: 204 });
		});

		test('差し替え申請(targetEmojiId指定時)は、必須設定の対象外になる', async () => {
			// JUICE: 直前のテストまでにaliceのpending件数が上限(既定3件)近くまで積み上がっているため、
			// 新規ユーザーで検証してTOO_MANY_PENDING_REQUESTSを避ける
			const carol = await signup();
			const emojiId = await seedApprovedEmojiRequest(carol, `owned_${Date.now()}`);

			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { emojiRequestRequireCategory: true, emojiRequestRequireTags: true, emojiRequestRequireLicense: true },
				user: root,
			}, { status: 204 });

			const replacementFile = await uploadFile(carol);
			await successfulApiCall({
				endpoint: 'emoji-requests/create',
				parameters: { fileId: replacementFile.body!.id, name: `dummy_${Date.now()}`, targetEmojiId: emojiId },
				user: carol,
			});

			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { emojiRequestRequireCategory: false, emojiRequestRequireTags: false, emojiRequestRequireLicense: false },
				user: root,
			}, { status: 204 });
		});
	});

	describe('アバターデコレーション申請', () => {
		test('既定(すべて任意)では、名前だけで申請できる', async () => {
			const file = await uploadFile(alice);
			await successfulApiCall({
				endpoint: 'avatar-decoration-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
				user: alice,
			});
		});

		test('カテゴリを必須にすると、未入力の申請は拒否される', async () => {
			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { avatarDecorationRequestRequireCategory: true },
				user: root,
			}, { status: 204 });

			const file = await uploadFile(alice);
			await failedApiCall({
				endpoint: 'avatar-decoration-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}` },
				user: alice,
			}, { status: 400, code: 'CATEGORY_REQUIRED', id: 'c2e01ff3-90ef-4f7c-a17b-4c8a9b06d5e0' });

			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { avatarDecorationRequestRequireCategory: false },
				user: root,
			}, { status: 204 });
		});

		test('説明を必須にすると、未入力の申請は拒否される(create-manyでも同様)', async () => {
			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { avatarDecorationRequestRequireDescription: true },
				user: root,
			}, { status: 204 });

			const file = await uploadFile(alice);
			await failedApiCall({
				endpoint: 'avatar-decoration-requests/create-many',
				parameters: { requests: [{ fileId: file.body!.id, name: `dummy_${Date.now()}` }] },
				user: alice,
			}, { status: 400, code: 'DESCRIPTION_REQUIRED', id: 'f5133226-c3f2-4caf-d4ae-7fbccc39f8f3' });

			await successfulApiCall({
				endpoint: 'avatar-decoration-requests/create-many',
				parameters: { requests: [{ fileId: file.body!.id, name: `dummy_${Date.now()}`, description: 'test' }] },
				user: alice,
			});

			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { avatarDecorationRequestRequireDescription: false },
				user: root,
			}, { status: 204 });
		});

		test('差し替え申請(targetAvatarDecorationId指定時)は、必須設定の対象外になる', async () => {
			// JUICE: 直前のテストまでにaliceのpending件数が上限(既定3件)近くまで積み上がっているため、
			// 新規ユーザーで検証してTOO_MANY_PENDING_REQUESTSを避ける
			const dave = await signup();
			const decorationId = await seedApprovedAvatarDecorationRequest(dave, `owned_${Date.now()}`);

			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { avatarDecorationRequestRequireCategory: true, avatarDecorationRequestRequireDescription: true },
				user: root,
			}, { status: 204 });

			const replacementFile = await uploadFile(dave);
			await successfulApiCall({
				endpoint: 'avatar-decoration-requests/create',
				parameters: { fileId: replacementFile.body!.id, name: `dummy_${Date.now()}`, targetAvatarDecorationId: decorationId },
				user: dave,
			});

			await successfulApiCall({
				endpoint: 'admin/juice/update-settings',
				parameters: { avatarDecorationRequestRequireCategory: false, avatarDecorationRequestRequireDescription: false },
				user: root,
			}, { status: 204 });
		});
	});
});
