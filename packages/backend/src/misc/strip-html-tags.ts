/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * インスタンス名等、本来プレーンテキストとして扱われるべき値からHTMLタグを取り除く(JUICE)。
 * サーバー名・短縮名はどこかでHTMLとして解釈される想定はなく(descriptionのように
 * v-htmlされる場面は無い)、PWA manifestのname/short_nameやOpenSearchのShortName等、
 * OSネイティブのツールチップ・検索バー等プレーンテキスト表示専用の場所へそのまま渡ると、
 * タグの記号がそのまま可視化されてしまうため、あらかじめ除去しておく。
 */
export function stripHtmlTags(text: string): string {
	return text.replace(/<[^>]*>/g, '');
}
