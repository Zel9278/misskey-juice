/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { exceedsMaxNestDepth, FORMULA_MAX_LENGTH, isFormulaTooComplex } from '@/utility/formula-safety.js';

describe('exceedsMaxNestDepth', () => {
	test('returns false for a formula with no braces', () => {
		expect(exceedsMaxNestDepth('x + y', 32)).toBe(false);
	});

	test('returns false when nesting stays within the limit', () => {
		const formula = '{'.repeat(32) + 'x' + '}'.repeat(32);
		expect(exceedsMaxNestDepth(formula, 32)).toBe(false);
	});

	test('returns true when nesting exceeds the limit', () => {
		const formula = '{'.repeat(33) + 'x' + '}'.repeat(33);
		expect(exceedsMaxNestDepth(formula, 32)).toBe(true);
	});

	test('measures the deepest concurrent nesting, not the total brace count', () => {
		// {a}{b}{c}... (連続する、ネストしていない波括弧) は深度1のまま
		const formula = '{a}'.repeat(100);
		expect(exceedsMaxNestDepth(formula, 32)).toBe(false);
	});

	test('does not crash on unbalanced closing braces', () => {
		expect(exceedsMaxNestDepth('}}}}}x{{{{{', 32)).toBe(false);
	});
});

describe('isFormulaTooComplex', () => {
	test('allows typical legitimate formulas', () => {
		expect(isFormulaTooComplex('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}')).toBe(false);
		expect(isFormulaTooComplex('\\sum_{k=0}^{n} \\binom{n}{k} x^k y^{n-k}')).toBe(false);
	});

	test('blocks a formula that is too long even without deep nesting', () => {
		expect(isFormulaTooComplex('x'.repeat(FORMULA_MAX_LENGTH))).toBe(false);
		expect(isFormulaTooComplex('x'.repeat(FORMULA_MAX_LENGTH + 1))).toBe(true);
	});

	// JUICE: 実際に報告された再現パターン(継続分数・入れ子のsum上下添字)がブロックされることを確認する
	test('blocks a deeply nested continued fraction (reported repro)', () => {
		const n = 100;
		const formula = '\\frac{1}{1+'.repeat(n) + '1' + '}'.repeat(n);
		expect(isFormulaTooComplex(formula)).toBe(true);
	});

	test('blocks deeply nested sum sub/superscripts (reported repro)', () => {
		const n = 50;
		const formula = '\\sum^{'.repeat(n) + 'x' + '}'.repeat(n) + '_{'.repeat(n) + 'y' + '}'.repeat(n);
		expect(isFormulaTooComplex(formula)).toBe(true);
	});
});
