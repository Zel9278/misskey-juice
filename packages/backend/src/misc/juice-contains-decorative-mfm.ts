/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';

// JUICE: 「投稿を自動でローカルのみにする」機能の判定用。MFMノード種別を3グループに分ける
// - 非装飾(素のテキスト・メンション・ハッシュタグ・URL・絵文字・<plain>): 判定対象外
// - 標準マークダウン系(太字・斜体・取り消し線・インラインコード・コードブロック):
//   一般的なMarkdownにも存在する記法なので、MFM独自の装飾とは別に判定する
// - MFM独自の装飾系(center・small・quote・search・数式・fn関数構文): 上記いずれでもないもの

const MARKDOWN_STYLE_NODE_TYPES = new Set<mfm.MfmNode['type']>([
	'bold',
	'italic',
	'strike',
	'inlineCode',
	'blockCode',
]);

const NON_DECORATIVE_NODE_TYPES = new Set<mfm.MfmNode['type']>([
	'text',
	'mention',
	'hashtag',
	'url',
	'link',
	'unicodeEmoji',
	'emojiCode',
	'plain',
]);

/**
 * MFMノード列(パース済みツリー)が、一般的なMarkdownにも存在する装飾構文
 * (太字・斜体・取り消し線・インラインコード・コードブロック)を含むかどうかを判定する
 */
export function containsMarkdownStyleMfm(nodes: mfm.MfmNode[]): boolean {
	return mfm.extract(nodes, (node) => MARKDOWN_STYLE_NODE_TYPES.has(node.type)).length > 0;
}

/**
 * MFMノード列(パース済みツリー)が、MFM独自の装飾構文(center・small・quote・search・
 * 数式・$[]関数構文等。標準Markdown相当の記法は除く)を含むかどうかを判定する
 */
export function containsFnStyleMfm(nodes: mfm.MfmNode[]): boolean {
	return mfm.extract(nodes, (node) => !NON_DECORATIVE_NODE_TYPES.has(node.type) && !MARKDOWN_STYLE_NODE_TYPES.has(node.type)).length > 0;
}
