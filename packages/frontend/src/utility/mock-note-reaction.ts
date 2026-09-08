/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: モック(MkNoteの:mock="true")なノートに、まだ承認されていない画像URLを使った
// カスタム絵文字リアクションを1件だけ付ける際に使う。
//
// composables/use-note-capture.tsのuseNoteCaptureは、ローカルカスタム絵文字リアクションの
// キーを`:name:`から`:name@.:`へ正規化した上でnote.reactionsに格納する。一方、
// MkReactionsViewer.reaction.vueはreactionEmojisを`getEmojiNameFromReaction(reaction)`
// (@@/js/emoji-name.js)の戻り値をキーとして参照するが、この関数はローカルマーク`@.`を
// 除去した「素のname」を返す(`:name@.:` → `name`。`@host`付きのリモートとは扱いが異なる)。
// reactionsのキーには`@.`を残しつつ、reactionEmojisのキーには`@.`を付けない形で
// 組み立てないと、URLの対応が取れずに画像読み込み失敗のダミー画像へフォールバックして
// しまう(実際に踏んだ不具合。前回`${name}@.`をキーにしていた修正は、
// getEmojiNameFromReactionの実際の戻り値と食い違っており不十分だった)。
// この関数は両方のキーを単一の入り口から一貫して生成することで、そのズレを構造的に防ぐ。
export function buildMockLocalCustomEmojiReaction(name: string, url: string): {
	reactions: Record<string, number>;
	reactionEmojis: Record<string, string>;
} {
	return {
		reactions: { [`:${name}@.:`]: 1 },
		reactionEmojis: { [name]: url },
	};
}
