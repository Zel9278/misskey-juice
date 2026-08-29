/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { assertTestDatabaseName, resetDb } from '@/misc/reset-db.js';
import type { DataSource } from 'typeorm';

/**
 * `resetDb` は接続先DB名しか見ないので、クエリを実行しないダミーで十分。
 */
function fakeDataSource(database: unknown): DataSource {
	return {
		options: { database },
		query: async () => [],
	} as unknown as DataSource;
}

describe('resetDb', () => {
	test('テスト用DBならリセットできる', async () => {
		await expect(resetDb(fakeDataSource('test-misskey'))).resolves.toBeUndefined();
	});

	test('開発用DBはリセットを拒否する', async () => {
		await expect(resetDb(fakeDataSource('misskey'))).rejects.toThrow(/refusing to reset/);
	});

	test('DB名が未設定ならリセットを拒否する', async () => {
		await expect(resetDb(fakeDataSource(undefined))).rejects.toThrow(/refusing to reset/);
	});

	test('DB名がテスト用でなければリセットを拒否する', async () => {
		await expect(resetDb(fakeDataSource('production'))).rejects.toThrow(/refusing to reset/);
	});
});

describe('assertTestDatabaseName', () => {
	test('DB名にtestを含めば許可する', () => {
		expect(() => assertTestDatabaseName('test-misskey', 'createPostgresDataSource')).not.toThrow();
	});

	test('DB名にtestを含まなければ拒否する(createPostgresDataSourceがsynchronize/dropSchemaを有効化する経路の再発防止)', () => {
		expect(() => assertTestDatabaseName('misskey', 'createPostgresDataSource')).toThrow(/refusing to reset\/sync/);
	});

	test('DB名が未設定なら拒否する', () => {
		expect(() => assertTestDatabaseName(undefined, 'createPostgresDataSource')).toThrow(/refusing to reset\/sync/);
	});

	test('エラーメッセージに呼び出し元のcontextが含まれる', () => {
		expect(() => assertTestDatabaseName('misskey', 'createPostgresDataSource')).toThrow(/^createPostgresDataSource:/);
	});
});
