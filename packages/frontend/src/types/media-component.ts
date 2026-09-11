/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type MediaComponentExposes = {
	isRevealed: () => boolean;
	// JUICE: メディアタイムラインの拡大ボタンなど、画像/動画本体をタップせずに外部から
	// 「タップして解除」と同じ同意フローを経由して表示解除させたい場合に使う
	reveal: () => Promise<void>;
};
