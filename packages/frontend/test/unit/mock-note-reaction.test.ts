/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { buildMockLocalCustomEmojiReaction } from '@/utility/mock-note-reaction.js';

describe('buildMockLocalCustomEmojiReaction', () => {
	test('produces a reactionEmojis key that matches how MkReactionsViewer.reaction.vue looks it up', () => {
		const { reactions, reactionEmojis } = buildMockLocalCustomEmojiReaction('preview', 'https://example.com/image.png');

		// composables/use-note-capture.tsのuseNoteCaptureは、この形の(既に`@.`が付いた)
		// reactionsキーは正規化(`:name:`→`:name@.:`)の対象にせずそのまま通す
		expect(Object.keys(reactions)).toEqual([':preview@.:']);

		// MkReactionsViewer.reaction.vueは`reaction.substring(1, reaction.length - 1)`で
		// reactionEmojisを引く。つまり先頭・末尾の`:`だけを外した文字列がキーになる
		const reactionKey = Object.keys(reactions)[0];
		const lookupKey = reactionKey.substring(1, reactionKey.length - 1);
		expect(reactionEmojis[lookupKey]).toBe('https://example.com/image.png');
	});

	test('keeps the emoji name and URL intact', () => {
		const { reactions, reactionEmojis } = buildMockLocalCustomEmojiReaction('my_emoji_1', 'https://example.com/a.webp');
		expect(reactions).toEqual({ ':my_emoji_1@.:': 1 });
		expect(reactionEmojis).toEqual({ 'my_emoji_1@.': 'https://example.com/a.webp' });
	});
});
