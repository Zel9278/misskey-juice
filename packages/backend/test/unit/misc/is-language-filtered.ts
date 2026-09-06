/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { isLanguageFiltered } from '@/misc/is-language-filtered.js';
import { MiNote } from '@/models/Note.js';

const base: MiNote = {
	id: 'some-note-id',
	replyId: null,
	reply: null,
	renoteId: null,
	renote: null,
	threadId: null,
	text: null,
	name: null,
	cw: null,
	lang: null,
	userId: 'some-user-id',
	user: null,
	localOnly: false,
	isAIGenerated: false,
	relayId: null,
	relay: null,
	reactionAcceptance: null,
	renoteCount: 0,
	repliesCount: 0,
	clippedCount: 0,
	pageCount: 0,
	reactions: {},
	visibility: 'public',
	uri: null,
	url: null,
	fileIds: [],
	attachedFileTypes: [],
	visibleUserIds: [],
	mentions: [],
	mentionedRemoteUsers: '',
	reactionAndUserPairCache: [],
	emojis: [],
	tags: [],
	hasPoll: false,
	channelId: null,
	channel: null,
	userHost: null,
	replyUserId: null,
	replyUserHost: null,
	renoteUserId: null,
	renoteUserHost: null,
	renoteChannelId: null,
};

describe('misc:is-language-filtered', () => {
	test('empty filteredLanguages should never filter', () => {
		const note: MiNote = { ...base, lang: 'en-US' };
		expect(isLanguageFiltered(note, new Set())).toBe(false);
	});

	test('note with unspecified language should never be filtered', () => {
		const note: MiNote = { ...base, lang: null };
		expect(isLanguageFiltered(note, new Set(['ja-JP']))).toBe(false);
	});

	test('note with a language not in filteredLanguages should be filtered', () => {
		const note: MiNote = { ...base, lang: 'en-US' };
		expect(isLanguageFiltered(note, new Set(['ja-JP']))).toBe(true);
	});

	test('note with a language in filteredLanguages should not be filtered', () => {
		const note: MiNote = { ...base, lang: 'ja-JP' };
		expect(isLanguageFiltered(note, new Set(['ja-JP']))).toBe(false);
	});

	test('pure renote (no own text) should be judged by the renoted note\'s language', () => {
		const note = {
			...base,
			renoteId: 'some-renote-id',
			lang: null,
			renote: { ...base, id: 'some-renote-id', lang: 'en-US' },
		} as unknown as MiNote;
		expect(isLanguageFiltered(note, new Set(['ja-JP']))).toBe(true);
	});

	test('renote\'s own lang takes precedence over the renoted note\'s language', () => {
		const note = {
			...base,
			renoteId: 'some-renote-id',
			lang: 'ja-JP',
			renote: { ...base, id: 'some-renote-id', lang: 'en-US' },
		} as unknown as MiNote;
		expect(isLanguageFiltered(note, new Set(['ja-JP']))).toBe(false);
	});
});
