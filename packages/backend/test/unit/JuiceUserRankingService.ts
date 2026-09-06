/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { isLocalForJuiceRanking } from '@/core/JuiceUserRankingService.js';

describe('isLocalForJuiceRanking', () => {
	test('returns true for a local user (host is null)', () => {
		expect(isLocalForJuiceRanking(null)).toBe(true);
	});

	test('returns false for a remote user (host is set)', () => {
		expect(isLocalForJuiceRanking('misskey.example.com')).toBe(false);
	});
});
