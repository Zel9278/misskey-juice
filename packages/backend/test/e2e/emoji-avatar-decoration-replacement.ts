/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// How to run:
// pnpm jest -- e2e/emoji-avatar-decoration-replacement.ts

// JUICE: 絵文字申請・アバターデコレーション申請の「差し替え申請」(既存の画像だけを差し替える)機能の
// 作成時バリデーション(所有権チェック・重複申請チェック)をe2eで検証する。
//
// 承認(admin/emoji-requests/approve等)自体は、申請者のDriveファイルをシステム所有として複製する際に
// 自分自身のURL(config.url、テスト環境では実在しないmisskey.local)へ自己参照fetchを行うため、
// このテスト環境では既知の制約により必ず失敗する(既存のupload-from-url系処理全般に共通する制約で
// このセッションで新規に踏んだものではない)。そのため「承認済みの申請から作られた絵文字/デコレーション」
// という前提状態は、承認エンドポイントを実際に呼ぶ代わりにDBへ直接シードして再現する。
// 承認成功時に画像が正しく差し替わる(IDは維持したまま)ことは、実際に動いているdevサーバーへの
// 手動curl確認で別途検証済み。
import * as assert from 'assert';
import { describe, beforeAll, test } from 'vitest';
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

describe('絵文字・アバターデコレーションの差し替え申請', () => {
	let db: DataSource;
	let root: SignupSuccessResponse;
	let alice: SignupSuccessResponse;
	let bob: SignupSuccessResponse;

	beforeAll(async () => {
		db = await initTestDb(true);
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

	describe('絵文字', () => {
		test('自分の承認済み申請から作られた絵文字を差し替え申請できる', async () => {
			const emojiId = await seedApprovedEmojiRequest(alice, `owned_${Date.now()}`);

			const file = await uploadFile(alice);
			const replacement = await successfulApiCall({
				endpoint: 'emoji-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}`, targetEmojiId: emojiId },
				user: alice,
			});
			assert.strictEqual(replacement.targetEmojiId, emojiId);
			assert.strictEqual(replacement.status, 'pending');
		});

		test('自分が作成していない絵文字は差し替え申請できない', async () => {
			const emojiId = await seedApprovedEmojiRequest(alice, `owned_${Date.now()}`);

			const file = await uploadFile(bob);
			await failedApiCall({
				endpoint: 'emoji-requests/create',
				parameters: { fileId: file.body!.id, name: `bob_${Date.now()}`, targetEmojiId: emojiId },
				user: bob,
			}, {
				status: 400,
				code: 'NOT_EMOJI_OWNER',
				id: 'e0e1a3f7-b710-4d65-bff5-2fe4cf0a5856',
			});
		});

		test('存在しない絵文字は差し替え申請できない', async () => {
			const file = await uploadFile(alice);
			await failedApiCall({
				endpoint: 'emoji-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}`, targetEmojiId: idService.gen() },
				user: alice,
			}, {
				status: 400,
				code: 'NO_SUCH_TARGET_EMOJI',
				id: 'b0f83cca-b274-4768-b21a-01a9b85ffd5c',
			});
		});

		test('同じ対象への差し替え申請が既にpendingの場合は拒否される', async () => {
			const emojiId = await seedApprovedEmojiRequest(alice, `owned_${Date.now()}`);

			const file1 = await uploadFile(alice);
			await successfulApiCall({
				endpoint: 'emoji-requests/create',
				parameters: { fileId: file1.body!.id, name: `dummy1_${Date.now()}`, targetEmojiId: emojiId },
				user: alice,
			});

			const file2 = await uploadFile(alice);
			await failedApiCall({
				endpoint: 'emoji-requests/create',
				parameters: { fileId: file2.body!.id, name: `dummy2_${Date.now()}`, targetEmojiId: emojiId },
				user: alice,
			}, {
				status: 400,
				code: 'DUPLICATE_REPLACEMENT_REQUEST',
				id: '25386898-f700-4108-9f4e-a39326d1017e',
			});
		});
	});

	describe('アバターデコレーション', () => {
		test('自分の承認済み申請から作られたデコレーションを差し替え申請できる', async () => {
			const decorationId = await seedApprovedAvatarDecorationRequest(alice, `owned_${Date.now()}`);

			const file = await uploadFile(alice);
			const replacement = await successfulApiCall({
				endpoint: 'avatar-decoration-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}`, targetAvatarDecorationId: decorationId },
				user: alice,
			});
			assert.strictEqual(replacement.targetAvatarDecorationId, decorationId);
			assert.strictEqual(replacement.status, 'pending');
		});

		test('存在しないデコレーションは差し替え申請できない', async () => {
			const file = await uploadFile(alice);
			await failedApiCall({
				endpoint: 'avatar-decoration-requests/create',
				parameters: { fileId: file.body!.id, name: `dummy_${Date.now()}`, targetAvatarDecorationId: idService.gen() },
				user: alice,
			}, {
				status: 400,
				code: 'NO_SUCH_TARGET_AVATAR_DECORATION',
				id: 'f903e6ab-a059-4ae5-b8f5-f2c073b7e423',
			});
		});

		test('自分が作成していないデコレーションは差し替え申請できない', async () => {
			const decorationId = await seedApprovedAvatarDecorationRequest(alice, `owned_${Date.now()}`);

			const file = await uploadFile(bob);
			await failedApiCall({
				endpoint: 'avatar-decoration-requests/create',
				parameters: { fileId: file.body!.id, name: `bob_${Date.now()}`, targetAvatarDecorationId: decorationId },
				user: bob,
			}, {
				status: 400,
				code: 'NOT_AVATAR_DECORATION_OWNER',
				id: 'eebe4860-b32f-48b4-a7c2-d5ef4712e01b',
			});
		});

		test('同じ対象への差し替え申請が既にpendingの場合は拒否される', async () => {
			const decorationId = await seedApprovedAvatarDecorationRequest(alice, `owned_${Date.now()}`);

			const file1 = await uploadFile(alice);
			await successfulApiCall({
				endpoint: 'avatar-decoration-requests/create',
				parameters: { fileId: file1.body!.id, name: `dummy1_${Date.now()}`, targetAvatarDecorationId: decorationId },
				user: alice,
			});

			const file2 = await uploadFile(alice);
			await failedApiCall({
				endpoint: 'avatar-decoration-requests/create',
				parameters: { fileId: file2.body!.id, name: `dummy2_${Date.now()}`, targetAvatarDecorationId: decorationId },
				user: alice,
			}, {
				status: 400,
				code: 'DUPLICATE_REPLACEMENT_REQUEST',
				id: '16198780-409b-419a-8ca6-85c31d4b688d',
			});
		});
	});
});
