/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: .txtファイルの文字コードを判定して読む(小説ビューワーと小説エディターの読み込みで使う)

// JUICE: 日本語の文章らしさの目安。正しい文字コードで読めた文章はひらがなを多く含み、誤った文字コードで
// 読んだ場合は置換文字(U+FFFD)や半角カナ・私用領域の文字だらけになる
function japaneseTextScore(text: string): number {
	let score = 0;
	for (const ch of text) {
		const code = ch.codePointAt(0) ?? 0;
		if (code === 0xFFFD) score -= 20;
		else if (code >= 0x3041 && code <= 0x309F) score += 2; // ひらがな
		else if (code >= 0x30A0 && code <= 0x30FF) score += 1; // カタカナ
		else if (code >= 0xFF61 && code <= 0xFF9F) score -= 2; // 半角カナ
		else if (code >= 0xE000 && code <= 0xF8FF) score -= 5; // 私用領域
	}
	return score;
}

export function decodeTextFile(buffer: ArrayBuffer): string {
	// JUICE: ブラウザ標準のTextDecoderにはエンコーディング自動判定機能が無いため、まずUTF-8として
	// 厳密にデコードし(正しいShift-JIS/EUC-JPのバイト列が同時に正しいUTF-8になることは実質無い)、
	// 失敗したらShift-JISとEUC-JPの両方で読んでみて、日本語の文章らしい方を採用する
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
	} catch {
		const sjis = new TextDecoder('shift-jis').decode(buffer);
		const eucjp = new TextDecoder('euc-jp').decode(buffer);
		return japaneseTextScore(eucjp) > japaneseTextScore(sjis) ? eucjp : sjis;
	}
}
