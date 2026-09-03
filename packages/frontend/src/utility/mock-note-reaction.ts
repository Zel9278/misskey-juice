/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: モック(MkNoteの:mock="true")なノートに、まだ承認されていない画像URLを使った
// カスタム絵文字リアクションを1件だけ付ける際に使う。
//
// composables/use-note-capture.tsのuseNoteCaptureは、ローカルカスタム絵文字リアクションの
// キーを`:name:`から`:name@.:`へ正規化した上でnote.reactionsに格納するが、
// note.reactionEmojisはそのまま渡す。MkReactionsViewer.reaction.vueは正規化後の
// reactionsのキーから(先頭と末尾の`:`だけを外した形、つまり`name@.`という文字列で)
// reactionEmojisを参照するため、reactions・reactionEmojisの両方のキーを
// あらかじめ同じ形式で組み立てておかないと、URLの対応が取れずに画像読み込み失敗の
// ダミー画像へフォールバックしてしまう(実際に踏んだ不具合)。この関数は両方のキーを
// 単一の入り口から一貫して生成することで、そのズレを構造的に防ぐ。
export function buildMockLocalCustomEmojiReaction(name: string, url: string): {
	reactions: Record<string, number>;
	reactionEmojis: Record<string, string>;
} {
	return {
		reactions: { [`:${name}@.:`]: 1 },
		reactionEmojis: { [`${name}@.`]: url },
	};
}
