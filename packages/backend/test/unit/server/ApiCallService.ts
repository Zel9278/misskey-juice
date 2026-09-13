/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { ApiCallService } from '@/server/api/ApiCallService.js';
import Logger from '@/logger.js';
import { envOption } from '@/env.js';
import { logManager } from '@/logging/logging-runtime.js';
import { PrettyConsoleBackend } from '@/logging/PrettyConsoleBackend.js';
import type { LogBackend } from '@/logging/LogBackend.js';
import type { LogRecord } from '@/logging/types.js';

/** API失敗ログを確認するための最小Fastify応答を作成します。 */
function createReply() {
	return {
		code: vi.fn(),
		header: vi.fn(),
		send: vi.fn(),
	};
}

/** APIサービスの依存関係を最小限の仮実装へ差し替えます。 */
function createService() {
	const authenticateService = {
		authenticate: vi.fn().mockResolvedValue([null, null]),
	};
	const telemetryService = {
		startSpan: vi.fn((_name: string, callback: () => unknown) => callback()),
		captureMessage: vi.fn(),
	};
	const apiLoggerService = { logger: new Logger('api') };

	const service = new ApiCallService(
		{} as never,
		{} as never,
		{} as never,
		authenticateService as never,
		{} as never,
		{} as never,
		apiLoggerService as never,
		{} as never,
		telemetryService as never,
	);
	return { service, telemetryService };
}

/** JUICE: ロールポリシーによる日次レート制限の動的上書き(ApiCallService.call())を検証するための最小依存差し替え */
function createServiceForRateLimitOverride(policies: Record<string, unknown>) {
	const rateLimiterService = { limit: vi.fn().mockResolvedValue(null) };
	const roleService = { getUserPolicies: vi.fn().mockResolvedValue(policies) };
	const authenticateService = {
		authenticate: vi.fn().mockResolvedValue([{ id: 'user1', isSuspended: false, approved: true }, null]),
	};
	const apiLoggerService = { logger: new Logger('api') };
	const telemetryService = {
		startSpan: vi.fn((_name: string, callback: () => unknown) => callback()),
		captureMessage: vi.fn(),
	};

	const service = new ApiCallService(
		{} as never,
		{} as never,
		{} as never,
		authenticateService as never,
		rateLimiterService as never,
		roleService as never,
		apiLoggerService as never,
		{} as never,
		telemetryService as never,
	);
	return { service, rateLimiterService };
}

// JUICE: 絵文字・アバターデコレーション申請の1日あたりの送信回数上限が、ep.nameの判定ミスや
// emojiRequestDailyLimit/avatarDecorationRequestDailyLimitの取り違えなく、正しいロールポリシー値で
// RateLimiterService.limit()に渡ることを検証する。dailyRemaining表示(RateLimiterService.peekUsage)側は
// test/unit/RateLimiterService.tsで別途検証済みのため、ここではApiCallService側の分岐だけに絞る
describe('ApiCallService JUICE daily rate limit override', () => {
	const policies = { rateLimitFactor: 1, emojiRequestDailyLimit: 3, avatarDecorationRequestDailyLimit: 7 };

	async function callWith(endpointName: string, baseMax: number) {
		const { service, rateLimiterService } = createServiceForRateLimitOverride(policies);
		try {
			const endpoint = {
				name: endpointName,
				meta: { limit: { duration: 1000, max: baseMax }, requireCredential: true },
				params: {},
				exec: vi.fn().mockResolvedValue({}),
			};
			const request = { method: 'POST', body: { i: 'token' }, query: {}, headers: {}, ip: '127.0.0.1' };
			const reply = createReply();

			await service.handleRequest(endpoint as never, request as never, reply as never);

			expect(rateLimiterService.limit).toHaveBeenCalledTimes(1);
			return rateLimiterService.limit.mock.calls[0][0] as { max: number };
		} finally {
			service.dispose();
		}
	}

	test('emoji-requests/create-manyはemojiRequestDailyLimitで上書きされる(avatarDecorationRequestDailyLimitと混同しない)', async () => {
		const limit = await callWith('emoji-requests/create-many', 5);
		expect(limit.max).toBe(policies.emojiRequestDailyLimit);
	});

	test('emoji-requests/create(単体)も同じくemojiRequestDailyLimitで上書きされる', async () => {
		const limit = await callWith('emoji-requests/create', 10);
		expect(limit.max).toBe(policies.emojiRequestDailyLimit);
	});

	test('avatar-decoration-requests/create-manyはavatarDecorationRequestDailyLimitで上書きされる(emojiRequestDailyLimitと混同しない)', async () => {
		const limit = await callWith('avatar-decoration-requests/create-many', 5);
		expect(limit.max).toBe(policies.avatarDecorationRequestDailyLimit);
	});

	test('avatar-decoration-requests/create(単体)も同じくavatarDecorationRequestDailyLimitで上書きされる', async () => {
		const limit = await callWith('avatar-decoration-requests/create', 10);
		expect(limit.max).toBe(policies.avatarDecorationRequestDailyLimit);
	});

	test('対象外のエンドポイントはmaxを上書きされず、meta.limitのデフォルト値のままになる', async () => {
		const limit = await callWith('notes/create', 100);
		expect(limit.max).toBe(100);
	});
});

describe('ApiCallService structured error logging', () => {
	test('redacts API credentials and serializes the endpoint error', async () => {
		const write = vi.fn<LogBackend['write']>();
		logManager.setBackend({ write });
		const previousQuiet = envOption.quiet;
		envOption.quiet = false;
		const { service, telemetryService } = createService();
		try {
			const reply = createReply();
			const endpoint = {
				name: 'notes/show',
				meta: {},
				params: {},
				exec: vi.fn().mockRejectedValue(new TypeError('broken endpoint')),
			};
			const request = {
				method: 'POST',
				body: {
					i: 'native-token',
					password: 'password',
					options: { visible: true },
				},
				query: {},
				headers: {},
				ip: '127.0.0.1',
			};

			await service.handleRequest(endpoint as never, request as never, reply as never);

			const record = write.mock.calls[0][0] as LogRecord;
			expect(record).toMatchObject({
				eventName: 'api.endpoint.failed',
				attributes: {
					'api.endpoint': 'notes/show',
					'api.params': {
						i: '[REDACTED]',
						password: '[REDACTED]',
						options: { visible: true },
					},
				},
				error: { type: 'TypeError', message: 'broken endpoint' },
			});
			expect(record.attributes?.['error.id']).toEqual(expect.any(String));
			expect(telemetryService.captureMessage.mock.calls[0][1].extra).not.toHaveProperty('ps');
		} finally {
			service.dispose();
			envOption.quiet = previousQuiet;
			logManager.setBackend(new PrettyConsoleBackend({ output: () => undefined }));
		}
	});
});
