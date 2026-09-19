/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import * as mfm from 'mfm-js';
import { containsMarkdownStyleMfm, containsFnStyleMfm } from '@/misc/juice-contains-decorative-mfm.js';

function checkMarkdown(text: string): boolean {
	return containsMarkdownStyleMfm(mfm.parse(text)!);
}

function checkFn(text: string): boolean {
	return containsFnStyleMfm(mfm.parse(text)!);
}

describe(containsMarkdownStyleMfm, () => {
	it('plain text is not markdown-style', () => {
		expect(checkMarkdown('hello world')).toBe(false);
	});
	it('mention/hashtag/url/emoji are not markdown-style', () => {
		expect(checkMarkdown('@foo #tag https://example.com :emoji: 🎉')).toBe(false);
	});
	it('<plain> escape is not markdown-style', () => {
		expect(checkMarkdown('<plain>**not bold**</plain>')).toBe(false);
	});
	it('bold is markdown-style', () => {
		expect(checkMarkdown('**bold**')).toBe(true);
	});
	it('italic is markdown-style', () => {
		expect(checkMarkdown('*italic*')).toBe(true);
	});
	it('strike is markdown-style', () => {
		expect(checkMarkdown('~~strike~~')).toBe(true);
	});
	it('inline code is markdown-style', () => {
		expect(checkMarkdown('`code`')).toBe(true);
	});
	it('block code is markdown-style', () => {
		expect(checkMarkdown('```\ncode\n```')).toBe(true);
	});
	it('center/fn are not markdown-style (belong to the other category)', () => {
		expect(checkMarkdown('<center>hi</center>')).toBe(false);
		expect(checkMarkdown('$[tada hi]')).toBe(false);
	});
	it('empty input is not markdown-style', () => {
		expect(containsMarkdownStyleMfm([])).toBe(false);
	});
});

describe(containsFnStyleMfm, () => {
	it('plain text is not fn-style', () => {
		expect(checkFn('hello world')).toBe(false);
	});
	it('mention/hashtag/url/emoji are not fn-style', () => {
		expect(checkFn('@foo #tag https://example.com :emoji: 🎉')).toBe(false);
	});
	it('<plain> escape is not fn-style', () => {
		expect(checkFn('<plain>$[tada not fn]</plain>')).toBe(false);
	});
	it('fn is fn-style', () => {
		expect(checkFn('$[tada hi]')).toBe(true);
	});
	it('center is fn-style', () => {
		expect(checkFn('<center>hi</center>')).toBe(true);
	});
	it('search is fn-style', () => {
		expect(checkFn('search query [search]')).toBe(true);
	});
	it('small is fn-style', () => {
		expect(checkFn('<small>hi</small>')).toBe(true);
	});
	it('quote is fn-style', () => {
		expect(checkFn('> quoted line')).toBe(true);
	});
	it('mathInline is fn-style', () => {
		expect(checkFn('\\(x\\)')).toBe(true);
	});
	it('mathBlock is fn-style', () => {
		expect(checkFn('\\[x\\]')).toBe(true);
	});
	it('bold/italic/strike/code are not fn-style (belong to the other category)', () => {
		expect(checkFn('**bold**')).toBe(false);
		expect(checkFn('*italic*')).toBe(false);
		expect(checkFn('~~strike~~')).toBe(false);
		expect(checkFn('`code`')).toBe(false);
	});
	it('empty input is not fn-style', () => {
		expect(containsFnStyleMfm([])).toBe(false);
	});
});
