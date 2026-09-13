/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'node-fetch';
import { OAuthLoginService } from '@/core/OAuthLoginService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';

describe('OAuthLoginService', () => {
	let app: TestingModule;
	let service: OAuthLoginService;
	let httpRequestService: Mocked<HttpRequestService>;

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [GlobalModule],
			providers: [
				OAuthLoginService,
				{
					provide: HttpRequestService, useFactory: () => ({
						send: vi.fn(),
						getJson: vi.fn(),
					}),
				},
			],
		}).compile();

		app.enableShutdownHooks();

		service = app.get(OAuthLoginService);
		httpRequestService = app.get(HttpRequestService) as Mocked<HttpRequestService>;
	});

	beforeEach(() => {
		httpRequestService.send.mockClear();
		httpRequestService.getJson.mockClear();
	});

	afterAll(async () => {
		await app.close();
	});

	function tokenExchangeSuccess() {
		httpRequestService.send.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ access_token: 'dummy-access-token' }),
		} as Response);
	}

	describe('sanitizeReturnTo', () => {
		test('null/undefinedはnullを返す', () => {
			expect(service.sanitizeReturnTo(null)).toBeNull();
			expect(service.sanitizeReturnTo(undefined)).toBeNull();
		});

		test('同一オリジンの相対パスはそのまま返す', () => {
			expect(service.sanitizeReturnTo('/settings/security')).toBe('/settings/security');
		});

		test('スキーム付きの絶対URLは拒否する(オープンリダイレクト対策)', () => {
			expect(service.sanitizeReturnTo('https://evil.example/phish')).toBeNull();
		});

		test('プロトコル相対URL(//)は拒否する', () => {
			expect(service.sanitizeReturnTo('//evil.example/phish')).toBeNull();
		});

		test('バックスラッシュを含むものは拒否する', () => {
			expect(service.sanitizeReturnTo('/\\evil.example')).toBeNull();
		});

		test('スキーム区切りのコロンを含むものは拒否する', () => {
			expect(service.sanitizeReturnTo('/redirect:javascript:alert(1)')).toBeNull();
		});
	});

	describe('link state', () => {
		test('発行したstateを一度だけ消費できる(二重消費は不可)', async () => {
			const url = await service.issueLinkState({ userId: 'user1', provider: 'discord', returnTo: null }, 'client-id');
			const stateParam = new URL(url).searchParams.get('state')!;

			const consumed = await service.consumeLinkState(stateParam);
			expect(consumed).toStrictEqual({ mode: 'link', userId: 'user1', provider: 'discord', returnTo: null });

			const consumedAgain = await service.consumeLinkState(stateParam);
			expect(consumedAgain).toBeNull();
		});

		test('存在しないstateはnullを返す', async () => {
			const consumed = await service.consumeLinkState('00000000-0000-4000-8000-000000000000');
			expect(consumed).toBeNull();
		});
	});

	describe('signin context', () => {
		test('next:totpの間はgetで繰り返し参照できる', async () => {
			const context = await service.issueSigninContext({ userId: 'user1', returnTo: null });
			expect(await service.getSigninContext(context)).toStrictEqual({ userId: 'user1', returnTo: null });
			expect(await service.getSigninContext(context)).toStrictEqual({ userId: 'user1', returnTo: null });
		});

		test('consumeSigninContext後はnullになる', async () => {
			const context = await service.issueSigninContext({ userId: 'user1', returnTo: null });
			await service.consumeSigninContext(context);
			expect(await service.getSigninContext(context)).toBeNull();
		});
	});

	describe('exchangeCodeAndFetchProfile', () => {
		test('discord: id/usernameからプロフィールを抽出する', async () => {
			tokenExchangeSuccess();
			httpRequestService.getJson.mockResolvedValue({ id: '123456789', username: 'discorduser' });

			const profile = await service.exchangeCodeAndFetchProfile('discord', 'code', 'client-id', 'client-secret', 'link');
			expect(profile).toStrictEqual({ providerUserId: '123456789', providerUsername: 'discorduser' });
		});

		test('google: OIDC userinfoのsub/emailからプロフィールを抽出する', async () => {
			tokenExchangeSuccess();
			httpRequestService.getJson.mockResolvedValue({ sub: '987654321', email: 'user@example.com' });

			const profile = await service.exchangeCodeAndFetchProfile('google', 'code', 'client-id', 'client-secret', 'signin');
			expect(profile).toStrictEqual({ providerUserId: '987654321', providerUsername: 'user@example.com' });
		});

		test('github: id/loginからプロフィールを抽出する(numberのidも文字列化する)', async () => {
			tokenExchangeSuccess();
			httpRequestService.getJson.mockResolvedValue({ id: 42, login: 'githubuser' });

			const profile = await service.exchangeCodeAndFetchProfile('github', 'code', 'client-id', 'client-secret', 'link');
			expect(profile).toStrictEqual({ providerUserId: '42', providerUsername: 'githubuser' });

			// JUICE: GitHubのtoken endpointはAcceptヘッダーを明示しないとform-urlencodedを返すため必須
			const sendArgs = httpRequestService.send.mock.calls[0][1] as { headers?: Record<string, string> };
			expect(sendArgs.headers?.Accept).toBe('application/json');
		});

		test('gitlab: id/usernameからプロフィールを抽出する(numberのidも文字列化する)', async () => {
			tokenExchangeSuccess();
			httpRequestService.getJson.mockResolvedValue({ id: 7, username: 'gitlabuser' });

			const profile = await service.exchangeCodeAndFetchProfile('gitlab', 'code', 'client-id', 'client-secret', 'link');
			expect(profile).toStrictEqual({ providerUserId: '7', providerUsername: 'gitlabuser' });
		});

		test('microsoft: id/userPrincipalNameからプロフィールを抽出する', async () => {
			tokenExchangeSuccess();
			httpRequestService.getJson.mockResolvedValue({ id: 'guid-123', userPrincipalName: 'user@example.onmicrosoft.com', displayName: 'Example User' });

			const profile = await service.exchangeCodeAndFetchProfile('microsoft', 'code', 'client-id', 'client-secret', 'signin');
			expect(profile).toStrictEqual({ providerUserId: 'guid-123', providerUsername: 'user@example.onmicrosoft.com' });
		});

		test('microsoft: userPrincipalNameが無い場合はdisplayNameで代替する', async () => {
			tokenExchangeSuccess();
			httpRequestService.getJson.mockResolvedValue({ id: 'guid-456', displayName: 'Example User' });

			const profile = await service.exchangeCodeAndFetchProfile('microsoft', 'code', 'client-id', 'client-secret', 'signin');
			expect(profile).toStrictEqual({ providerUserId: 'guid-456', providerUsername: 'Example User' });
		});

		test('トークン交換が失敗したら例外を投げる', async () => {
			httpRequestService.send.mockResolvedValue({ ok: false, status: 400 } as Response);
			await expect(service.exchangeCodeAndFetchProfile('discord', 'code', 'client-id', 'client-secret', 'link'))
				.rejects.toThrow();
		});

		test('access_tokenが無いレスポンスは例外を投げる', async () => {
			httpRequestService.send.mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({}),
			} as Response);
			await expect(service.exchangeCodeAndFetchProfile('discord', 'code', 'client-id', 'client-secret', 'link'))
				.rejects.toThrow();
		});

		test('プロフィール取得時、自前でUser-Agentヘッダーを上書きしない(HttpRequestServiceの既定に任せる)', async () => {
			tokenExchangeSuccess();
			httpRequestService.getJson.mockResolvedValue({ id: '1', username: 'u' });

			await service.exchangeCodeAndFetchProfile('discord', 'code', 'client-id', 'client-secret', 'link');

			const getJsonArgs = httpRequestService.getJson.mock.calls[0];
			// getJson(url, accept, headers) の第3引数(headers)にUser-Agentを含めていないこと
			const headers = getJsonArgs[2] as Record<string, string> | undefined;
			expect(headers?.['User-Agent']).toBeUndefined();
		});
	});
});
