/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { getEmojiNameFromReaction } from '@@/js/emoji-name.js';
import { buildMockLocalCustomEmojiReaction } from '@/utility/mock-note-reaction.js';

describe('buildMockLocalCustomEmojiReaction', () => {
	test('produces a reactionEmojis key that matches how MkReactionsViewer.reaction.vue looks it up', () => {
		const { reactions, reactionEmojis } = buildMockLocalCustomEmojiReaction('preview', 'https://example.com/image.png');

		// composables/use-note-capture.tsのuseNoteCaptureは、この形の(既に`@.`が付いた)
		// reactionsキーは正規化(`:name:`→`:name@.:`)の対象にせずそのまま通す
		expect(Object.keys(reactions)).toEqual([':preview@.:']);

		// MkReactionsViewer.reaction.vueは実際には@@/js/emoji-name.jsの
		// getEmojiNameFromReaction(reaction)の戻り値をキーとしてreactionEmojisを引く
		// (単純に先頭・末尾の`:`を外すだけではなく、ローカルマーク`@.`も除去される)。
		// テストのアサーション自体がこの実装と食い違っていると、utility側だけを実装に
		// 合わせて実際のコンポーネントとはズレたままテストが通ってしまうため、
		// 本物の関数を直接呼んでキーを求める
		const reactionKey = Object.keys(reactions)[0];
		const lookupKey = getEmojiNameFromReaction(reactionKey);
		expect(lookupKey).toBe('preview');
		expect(reactionEmojis[lookupKey]).toBe('https://example.com/image.png');
	});

	test('keeps the emoji name and URL intact', () => {
		const { reactions, reactionEmojis } = buildMockLocalCustomEmojiReaction('my_emoji_1', 'https://example.com/a.webp');
		expect(reactions).toEqual({ ':my_emoji_1@.:': 1 });
		expect(reactionEmojis).toEqual({ my_emoji_1: 'https://example.com/a.webp' });
	});
});
