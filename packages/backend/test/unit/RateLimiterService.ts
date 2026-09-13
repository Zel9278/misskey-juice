/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { RateLimiterService } from '@/server/api/RateLimiterService.js';
import * as endpointsObject from '@/server/api/endpoint-list.js';

// JUICE: peekUsage()(消費を伴わない使用状況の参照、絵文字/アバターデコレーション申請フォームの
// 「本日あと何回申請できるか」「次にいつ枠が空くか(ETA)」表示のために追加)のテスト。
// limit()と異なり、peekUsage()はブロックを行わない参照専用の処理のため、
// NODE_ENV!=='production'でthis.disabledがtrueになる場合でも早期returnせず常にRedisを読む
// (dev環境でもUI表示を確認できるようにするため)
describe('RateLimiterService', () => {
	function createLoggerService() {
		return { getLogger: () => ({ debug: vi.fn(), warn: vi.fn() }) } as any;
	}

	// zremrangebyscore・zcard・zrange(oldest)・zrange(oldestInRange)の4オペレーション分の
	// execモックを組み立てるヘルパー
	function mockRedisMulti(used: number, oldestMember: string | null, oldestInRangeMember: string | null) {
		const execMock = vi.fn().mockResolvedValue([
			[null, 0],
			[null, used],
			[null, oldestMember != null ? [oldestMember] : []],
			[null, oldestInRangeMember != null ? [oldestInRangeMember] : []],
		]);
		const multiMock = vi.fn().mockReturnValue({ exec: execMock });
		return { multiMock, redisClient: { multi: multiMock } as any };
	}

	describe('peekUsage', () => {
		test('NODE_ENV!==productionでも(limit()と異なり)早期returnせず、Redisを読みに行く', async () => {
			const originalEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = 'test';
			try {
				const { multiMock, redisClient } = mockRedisMulti(2, null, null);
				const service = new RateLimiterService(redisClient, createLoggerService());

				const result = await service.peekUsage({ key: 'emoji-requests/create-many', duration: 1000, max: 5 }, 'actor1');

				expect(result).toEqual({ used: 2, max: 5, resetAt: null });
				expect(multiMock).toHaveBeenCalledTimes(1);
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});

		test('durationまたはmaxが無い場合はnullを返す(短期(minInterval)専用のlimitationは対象外)', async () => {
			const { multiMock, redisClient } = mockRedisMulti(0, null, null);
			const service = new RateLimiterService(redisClient, createLoggerService());

			expect(await service.peekUsage({ key: 'k', duration: null, max: 5 }, 'actor1')).toBeNull();
			expect(await service.peekUsage({ key: 'k', duration: 1000, max: null }, 'actor1')).toBeNull();
			expect(multiMock).not.toHaveBeenCalled();
		});

		test('factorが0以下の場合、ApiCallService.call()のfactor>0ガードと同じくバイパス扱いでnullを返す', async () => {
			const { multiMock, redisClient } = mockRedisMulti(0, null, null);
			const service = new RateLimiterService(redisClient, createLoggerService());

			expect(await service.peekUsage({ key: 'k', duration: 1000, max: 5 }, 'actor1', 0)).toBeNull();
			expect(await service.peekUsage({ key: 'k', duration: 1000, max: 5 }, 'actor1', -1)).toBeNull();
			expect(multiMock).not.toHaveBeenCalled();
		});

		test('zadd(消費)を伴わずlimit()と同じZSETキーの件数だけを読み取る', async () => {
			const { multiMock, redisClient } = mockRedisMulti(3, null, null);
			const service = new RateLimiterService(redisClient, createLoggerService());

			const result = await service.peekUsage({ key: 'emoji-requests/create-many', duration: 1000, max: 5 }, 'actor1');

			expect(result).toEqual({ used: 3, max: 5, resetAt: null });
			expect(multiMock).toHaveBeenCalledTimes(1);

			const operations: unknown[][] = multiMock.mock.calls[0][0];
			expect(operations).toHaveLength(4);
			expect(operations[0][0]).toBe('zremrangebyscore');
			expect(operations[0][1]).toBe('limit:actor1:emoji-requests/create-many');
			expect(operations[1]).toEqual(['zcard', 'limit:actor1:emoji-requests/create-many']);
			// limit()と異なり、新しいタイムスタンプの追加(zadd、消費)は行わない
			expect(operations.some(op => op[0] === 'zadd')).toBe(false);
		});

		test('rateLimitFactorに応じてmaxが調整される(limit()のmax/factorと同じ計算)', async () => {
			const { redisClient } = mockRedisMulti(1, null, null);
			const service = new RateLimiterService(redisClient, createLoggerService());

			const result = await service.peekUsage({ key: 'k', duration: 1000, max: 5 }, 'actor1', 2);

			expect(result).toEqual({ used: 1, max: 2.5, resetAt: null });
		});

		test('今回の集計期間に送信実績が無い場合(ZSETが空)、resetAtはnullになる', async () => {
			const { redisClient } = mockRedisMulti(0, null, null);
			const service = new RateLimiterService(redisClient, createLoggerService());

			const result = await service.peekUsage({ key: 'k', duration: 1000, max: 5 }, 'actor1');

			expect(result?.resetAt).toBeNull();
		});

		test('使用中の枠がmax未満の場合、窓の境界(zrange -max -max)がRedisのクランプにより全体最古と同じ値になり、それがresetAtの基準になる', async () => {
			// duration=1000ms(ミリ秒)なので、microtime換算では*1000する必要がある
			const oldestMicro = 5_000_000; // 5秒(マイクロ秒表記)
			const { redisClient } = mockRedisMulti(2, String(oldestMicro), String(oldestMicro));
			const service = new RateLimiterService(redisClient, createLoggerService());

			const result = await service.peekUsage({ key: 'k', duration: 1000, max: 5 }, 'actor1');

			// resetAt(ms) = floor((oldestMicro + duration*1000) / 1000) = floor((5_000_000 + 1_000_000) / 1000) = 6000
			expect(result?.resetAt).toBe(6000);
		});

		test('使用中の枠がmax以上ある場合、窓の境界(oldestInRange)を基準にresetAtを算出する(全体最古とは異なる値)', async () => {
			const oldestMicro = 1_000_000; // 全体最古(範囲外、既に窓からあふれている想定)
			const oldestInRangeMicro = 4_000_000; // 現在の上限max件で見た場合の窓の境界
			const { redisClient } = mockRedisMulti(5, String(oldestMicro), String(oldestInRangeMicro));
			const service = new RateLimiterService(redisClient, createLoggerService());

			const result = await service.peekUsage({ key: 'k', duration: 1000, max: 5 }, 'actor1');

			// oldestInRangeMicro基準: floor((4_000_000 + 1_000_000) / 1000) = 5000
			expect(result?.resetAt).toBe(5000);
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
