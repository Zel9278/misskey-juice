/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { RateLimiterService } from '@/server/api/RateLimiterService.js';
import * as endpointsObject from '@/server/api/endpoint-list.js';

// JUICE: peekUsage()(消費を伴わない使用状況の参照、絵文字/アバターデコレーション申請フォームの
// 「本日あと何回申請できるか」表示のために追加)のテスト。RateLimiterServiceは
// NODE_ENV!=='production'だとdisabled=trueになりレートリミット自体が働かないため、
// production環境相当の挙動を検証するテストだけ一時的にNODE_ENVを差し替える
describe('RateLimiterService', () => {
	function createLoggerService() {
		return { getLogger: () => ({ debug: vi.fn(), warn: vi.fn() }) } as any;
	}

	describe('peekUsage', () => {
		test('NODE_ENV!==productionの場合、Redisにアクセスせずnullを返す', async () => {
			const multiMock = vi.fn();
			const redisClient = { multi: multiMock } as any;
			const service = new RateLimiterService(redisClient, createLoggerService());

			const result = await service.peekUsage({ key: 'emoji-requests/create-many', duration: 1000, max: 5 }, 'actor1');

			expect(result).toBeNull();
			expect(multiMock).not.toHaveBeenCalled();
		});

		test('durationまたはmaxが無い場合はnullを返す(短期(minInterval)専用のlimitationは対象外)', async () => {
			const originalEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = 'production';
			try {
				const multiMock = vi.fn();
				const redisClient = { multi: multiMock } as any;
				const service = new RateLimiterService(redisClient, createLoggerService());

				expect(await service.peekUsage({ key: 'k', duration: null, max: 5 }, 'actor1')).toBeNull();
				expect(await service.peekUsage({ key: 'k', duration: 1000, max: null }, 'actor1')).toBeNull();
				expect(multiMock).not.toHaveBeenCalled();
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});

		test('factorが0以下の場合、ApiCallService.call()のfactor>0ガードと同じくバイパス扱いでnullを返す', async () => {
			const originalEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = 'production';
			try {
				const multiMock = vi.fn();
				const redisClient = { multi: multiMock } as any;
				const service = new RateLimiterService(redisClient, createLoggerService());

				expect(await service.peekUsage({ key: 'k', duration: 1000, max: 5 }, 'actor1', 0)).toBeNull();
				expect(await service.peekUsage({ key: 'k', duration: 1000, max: 5 }, 'actor1', -1)).toBeNull();
				expect(multiMock).not.toHaveBeenCalled();
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});

		test('production相当の環境では、zadd(消費)を伴わずlimit()と同じZSETキーの件数だけを読み取る', async () => {
			const originalEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = 'production';
			try {
				const execMock = vi.fn().mockResolvedValue([[null, 0], [null, 3]]);
				const multiMock = vi.fn().mockReturnValue({ exec: execMock });
				const redisClient = { multi: multiMock } as any;
				const service = new RateLimiterService(redisClient, createLoggerService());

				const result = await service.peekUsage({ key: 'emoji-requests/create-many', duration: 1000, max: 5 }, 'actor1');

				expect(result).toEqual({ used: 3, max: 5 });
				expect(multiMock).toHaveBeenCalledTimes(1);

				const operations: unknown[][] = multiMock.mock.calls[0][0];
				expect(operations).toHaveLength(2);
				expect(operations[0][0]).toBe('zremrangebyscore');
				expect(operations[0][1]).toBe('limit:actor1:emoji-requests/create-many');
				expect(operations[1]).toEqual(['zcard', 'limit:actor1:emoji-requests/create-many']);
				// limit()と異なり、新しいタイムスタンプの追加(zadd、消費)は行わない
				expect(operations.some(op => op[0] === 'zadd')).toBe(false);
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});

		test('rateLimitFactorに応じてmaxが調整される(limit()のmax/factorと同じ計算)', async () => {
			const originalEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = 'production';
			try {
				const execMock = vi.fn().mockResolvedValue([[null, 0], [null, 1]]);
				const multiMock = vi.fn().mockReturnValue({ exec: execMock });
				const redisClient = { multi: multiMock } as any;
				const service = new RateLimiterService(redisClient, createLoggerService());

				const result = await service.peekUsage({ key: 'k', duration: 1000, max: 5 }, 'actor1', 2);

				expect(result).toEqual({ used: 1, max: 2.5 });
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});
	});

	// JUICE: emoji-requests/count・avatar-decoration-requests/countはpeekUsage()呼び出し時に
	// 対象エンドポイント名をハードコードした文字列で渡している(ApiCallService側はep.nameから
	// 自動導出するため、この2箇所だけは追随できない)。エンドポイント名が変わったりリネームされた
	// 場合に黙って存在しないバケットを覗き続けることを防ぐため、実際に登録されているエンドポイント名と
	// 一致することを確認する
	describe('emoji/avatar-decoration-requestsのcount.tsが参照するキーの整合性', () => {
		test('emoji-requests/count.tsがpeekUsageに渡すkeyは実際に登録されたエンドポイント名と一致する', () => {
			expect('emoji-requests/create-many' in endpointsObject).toBe(true);
		});

		test('avatar-decoration-requests/count.tsがpeekUsageに渡すkeyは実際に登録されたエンドポイント名と一致する', () => {
			expect('avatar-decoration-requests/create-many' in endpointsObject).toBe(true);
		});
	});
});
