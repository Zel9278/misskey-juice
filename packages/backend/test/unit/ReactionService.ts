/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'assert';
import { afterAll, afterEach, beforeAll, beforeEach, describe, test } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';

import { CoreModule } from '@/core/CoreModule.js';
import { ReactionService } from '@/core/ReactionService.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { RoleService } from '@/core/RoleService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import type {
	EmojisRepository,
	MiEmoji,
	MiMeta,
	MiNote,
	MiRole,
	MiUser,
	NoteReactionsRepository,
	NotesRepository,
	RoleAssignmentsRepository,
	RolesRepository,
	UserProfilesRepository,
	UsersRepository,
} from '@/models/_.js';

describe('ReactionService', () => {
	let reactionService: ReactionService;

	beforeAll(async () => {
		const app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
		}).compile();
		reactionService = app.get<ReactionService>(ReactionService);
	});

	describe('normalize', () => {
		test('絵文字リアクションはそのまま', () => {
			assert.strictEqual(reactionService.normalize('👍'), '👍');
			assert.strictEqual(reactionService.normalize('🍅'), '🍅');
		});

		test('既存のリアクションは絵文字化する pudding', () => {
			assert.strictEqual(reactionService.normalize('pudding'), '🍮');
		});

		test('既存のリアクションは絵文字化する like', () => {
			assert.strictEqual(reactionService.normalize('like'), '👍');
		});

		test('既存のリアクションは絵文字化する love', () => {
			assert.strictEqual(reactionService.normalize('love'), '❤');
		});

		test('既存のリアクションは絵文字化する laugh', () => {
			assert.strictEqual(reactionService.normalize('laugh'), '😆');
		});

		test('既存のリアクションは絵文字化する hmm', () => {
			assert.strictEqual(reactionService.normalize('hmm'), '🤔');
		});

		test('既存のリアクションは絵文字化する surprise', () => {
			assert.strictEqual(reactionService.normalize('surprise'), '😮');
		});

		test('既存のリアクションは絵文字化する congrats', () => {
			assert.strictEqual(reactionService.normalize('congrats'), '🎉');
		});

		test('既存のリアクションは絵文字化する angry', () => {
			assert.strictEqual(reactionService.normalize('angry'), '💢');
		});

		test('既存のリアクションは絵文字化する confused', () => {
			assert.strictEqual(reactionService.normalize('confused'), '😥');
		});

		test('既存のリアクションは絵文字化する rip', () => {
			assert.strictEqual(reactionService.normalize('rip'), '😇');
		});

		test('既存のリアクションは絵文字化する star', () => {
			assert.strictEqual(reactionService.normalize('star'), '⭐');
		});

		test('異体字セレクタ除去', () => {
			assert.strictEqual(reactionService.normalize('㊗️'), '㊗');
		});

		test('異体字セレクタ除去 必要なし', () => {
			assert.strictEqual(reactionService.normalize('㊗'), '㊗');
		});

		test('fallback - null', () => {
			assert.strictEqual(reactionService.normalize(null), '❤');
		});

		test('fallback - empty', () => {
			assert.strictEqual(reactionService.normalize(''), '❤');
		});

		test('fallback - unknown', () => {
			assert.strictEqual(reactionService.normalize('unknown'), '❤');
		});
	});

	describe('convertLegacyReactions', () => {
		test('空の入力に対しては何もしない', () => {
			const input = {};
			assert.deepStrictEqual(reactionService.convertLegacyReactions(input), input);
		});

		test('Unicode絵文字リアクションを変換してしまわない', () => {
			const input = { '👍': 1, '🍮': 2 };
			assert.deepStrictEqual(reactionService.convertLegacyReactions(input), input);
		});

		test('カスタム絵文字リアクションを変換してしまわない', () => {
			const input = { ':like@.:': 1, ':pudding@example.tld:': 2 };
			assert.deepStrictEqual(reactionService.convertLegacyReactions(input), input);
		});

		test('文字列によるレガシーなリアクションを変換する', () => {
			const input = { 'like': 1, 'pudding': 2 };
			const output = { '👍': 1, '🍮': 2 };
			assert.deepStrictEqual(reactionService.convertLegacyReactions(input), output);
		});

		test('host部分が省略されたレガシーなカスタム絵文字リアクションを変換する', () => {
			const input = { ':custom_emoji:': 1 };
			const output = { ':custom_emoji@.:': 1 };
			assert.deepStrictEqual(reactionService.convertLegacyReactions(input), output);
		});

		test('「0個のリアクション」情報を削除する', () => {
			const input = { 'angry': 0 };
			const output = {};
			assert.deepStrictEqual(reactionService.convertLegacyReactions(input), output);
		});

		test('host部分の有無によりデコードすると同じ表記になるカスタム絵文字リアクションの個数情報を正しく足し合わせる', () => {
			const input = { ':custom_emoji:': 1, ':custom_emoji@.:': 2 };
			const output = { ':custom_emoji@.:': 3 };
			assert.deepStrictEqual(reactionService.convertLegacyReactions(input), output);
		});
	});

	// JUICE: リアクション相乗り(ノートに既についている他人のリアクションをクリックして、
	// 自分も同じリアクションを付けること)のcreate()内での解決ロジックの回帰テスト。
	// レビューで実際に検出されたバグ(media-silenced-hostチェックの対象取り違え、
	// リモートアクターによるホスト詐称)の再発防止を主眼とする。
	describe('create - リアクション相乗り', () => {
		let app: TestingModule;
		let service: ReactionService;
		let juiceSettingsService: JuiceSettingsService;
		let idService: IdService;
		let usersRepository: UsersRepository;
		let userProfilesRepository: UserProfilesRepository;
		let notesRepository: NotesRepository;
		let emojisRepository: EmojisRepository;
		let noteReactionsRepository: NoteReactionsRepository;
		let rolesRepository: RolesRepository;
		let roleAssignmentsRepository: RoleAssignmentsRepository;
		let roleService: RoleService;
		let meta: MiMeta;

		let alice: MiUser; // ローカルユーザー(相乗りする側)
		let bob: MiUser; // ノート投稿者(ローカル)
		let remoteNoteAuthor: MiUser; // ノート投稿者(リモート)
		let remoteReacter: MiUser; // リアクションする側(リモート、なりすまし検証用)

		async function createUser(data: Partial<MiUser> = {}) {
			const user = await usersRepository
				.insert({
					id: idService.gen(),
					username: 'user',
					usernameLower: 'user',
					...data,
				})
				.then(x => usersRepository.findOneByOrFail(x.identifiers[0]));

			await userProfilesRepository.insert({ userId: user.id });

			return user;
		}

		async function createNote(user: MiUser, data: Partial<MiNote> = {}) {
			return await notesRepository
				.insert({
					id: idService.gen(),
					text: 'hello',
					userId: user.id,
					userHost: user.host,
					visibility: 'public',
					reactionAndUserPairCache: [],
					tags: [],
					...data,
				})
				.then(x => notesRepository.findOneByOrFail(x.identifiers[0]));
		}

		async function createEmoji(data: Partial<MiEmoji> = {}) {
			return await emojisRepository
				.insert({
					id: idService.gen(),
					updatedAt: new Date(),
					name: 'test_emoji',
					host: null,
					originalUrl: 'https://example.com/emoji.png',
					publicUrl: 'https://example.com/emoji.png',
					type: 'image/png',
					aliases: [],
					category: null,
					license: null,
					isSensitive: false,
					localOnly: false,
					roleIdsThatCanBeUsedThisEmojiAsReaction: [],
					...data,
				})
				.then(x => emojisRepository.findOneByOrFail(x.identifiers[0]));
		}

		async function createRole(data: Partial<MiRole> = {}) {
			return await rolesRepository
				.insert({
					id: idService.gen(),
					updatedAt: new Date(),
					lastUsedAt: new Date(),
					name: 'test role',
					description: '',
					...data,
				})
				.then(x => rolesRepository.findOneByOrFail(x.identifiers[0]));
		}

		async function assignRole(user: MiUser, role: MiRole) {
			// JUICE: roleAssignmentsRepositoryへの直接insertだと、RoleServiceの
			// roleAssignmentByUserIdCache(5分キャッシュ)が更新されず、直後にgetUserRoles()
			// を呼んでも反映されない。RoleService.assign()経由でキャッシュも正しく更新する
			await roleService.assign(user.id, role.id);
		}

		async function reactedAs(noteId: MiNote['id'], userId: MiUser['id']) {
			const r = await noteReactionsRepository.findOneByOrFail({ noteId, userId });
			return r.reaction;
		}

		beforeAll(async () => {
			app = await Test.createTestingModule({
				imports: [GlobalModule, CoreModule],
			}).compile();
			app.enableShutdownHooks();

			service = app.get<ReactionService>(ReactionService);
			juiceSettingsService = app.get<JuiceSettingsService>(JuiceSettingsService);
			idService = app.get<IdService>(IdService);
			usersRepository = app.get<UsersRepository>(DI.usersRepository);
			userProfilesRepository = app.get<UserProfilesRepository>(DI.userProfilesRepository);
			notesRepository = app.get<NotesRepository>(DI.notesRepository);
			emojisRepository = app.get<EmojisRepository>(DI.emojisRepository);
			noteReactionsRepository = app.get<NoteReactionsRepository>(DI.noteReactionsRepository);
			rolesRepository = app.get<RolesRepository>(DI.rolesRepository);
			roleAssignmentsRepository = app.get<RoleAssignmentsRepository>(DI.roleAssignmentsRepository);
			roleService = app.get<RoleService>(RoleService);
			meta = app.get<MiMeta>(DI.meta);
		});

		afterAll(async () => {
			await app.close();
		});

		beforeEach(async () => {
			alice = await createUser({ username: 'alice', host: null });
			bob = await createUser({ username: 'bob', host: null });
			remoteNoteAuthor = await createUser({ username: 'remotenoteauthor', host: 'author.example' });
			remoteReacter = await createUser({ username: 'remotereacter', host: 'reacter.example' });

			await juiceSettingsService.update({ reactionPiggybackOnRemoteEnabled: true });
			meta.mediaSilencedHosts = [];
		});

		afterEach(async () => {
			await noteReactionsRepository.deleteAll();
			await roleAssignmentsRepository.deleteAll();
			await rolesRepository.deleteAll();
			await emojisRepository.deleteAll();
			await notesRepository.deleteAll();
			await userProfilesRepository.deleteAll();
			await usersRepository.deleteAll();
			await juiceSettingsService.update({ reactionPiggybackOnRemoteEnabled: false });
			meta.mediaSilencedHosts = [];
		});

		test('設定が有効なら、ローカルユーザーはこのサーバーが既に把握しているリモートホストの絵文字に相乗りできる', async () => {
			const emoji = await createEmoji({ name: 'piggyback', host: 'remote.example' });
			const note = await createNote(bob);

			await service.create(alice, note, `:${emoji.name}@remote.example:`);

			assert.strictEqual(await reactedAs(note.id, alice.id), ':piggyback@remote.example:');
		});

		test('設定が無効なら、リモートホストを指定したリアクションは❤にフォールバックする', async () => {
			await juiceSettingsService.update({ reactionPiggybackOnRemoteEnabled: false });
			await createEmoji({ name: 'piggyback', host: 'remote.example' });
			const note = await createNote(bob);

			await service.create(alice, note, ':piggyback@remote.example:');

			assert.strictEqual(await reactedAs(note.id, alice.id), '❤');
		});

		test('ホスト未指定でも、ローカルに無ければノート投稿者のホストの絵文字に相乗りできる', async () => {
			const emoji = await createEmoji({ name: 'authoremoji', host: 'author.example' });
			const note = await createNote(remoteNoteAuthor);

			await service.create(alice, note, `:${emoji.name}:`);

			assert.strictEqual(await reactedAs(note.id, alice.id), ':authoremoji@author.example:');
		});

		test('media-silenced-hostに指定されたホストの絵文字は、相乗り経由でも❤にフォールバックする', async () => {
			await createEmoji({ name: 'silenced', host: 'remote.example' });
			meta.mediaSilencedHosts = ['remote.example'];
			const note = await createNote(bob);

			await service.create(alice, note, ':silenced@remote.example:');

			assert.strictEqual(await reactedAs(note.id, alice.id), '❤');
		});

		test('ロール制限付きの絵文字は、相乗り経由でも権限の無いユーザーには❤にフォールバックする', async () => {
			const role = await createRole({ name: 'emoji role' });
			const emoji = await createEmoji({
				name: 'rolegated',
				host: 'remote.example',
				roleIdsThatCanBeUsedThisEmojiAsReaction: [role.id],
			});
			const note = await createNote(bob);

			await service.create(alice, note, `:${emoji.name}@remote.example:`);
			assert.strictEqual(await reactedAs(note.id, alice.id), '❤');

			await noteReactionsRepository.delete({ noteId: note.id, userId: alice.id });
			await assignRole(alice, role);

			await service.create(alice, note, `:${emoji.name}@remote.example:`);
			assert.strictEqual(await reactedAs(note.id, alice.id), `:${emoji.name}@remote.example:`);
		});

		test('リモートユーザーからのリアクションは、ホストを詐称して他ホストの絵文字を参照できない(なりすまし防止)', async () => {
			// remoteReacter(host: reacter.example)自身のホストには存在しない、別ホストの絵文字を
			// 明示的に指定しても、reacterHost(reacter.example)以外は参照できないことを確認する
			await createEmoji({ name: 'spoofed', host: 'author.example' });
			const note = await createNote(bob);

			await service.create(remoteReacter, note, ':spoofed@author.example:');

			assert.strictEqual(await reactedAs(note.id, remoteReacter.id), '❤');
		});
	});
});
