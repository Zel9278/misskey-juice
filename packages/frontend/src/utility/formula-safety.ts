/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: 数式(KaTeX)のレンダリング前の安全チェック。KaTeXの`renderToString`自体は深いネスト
// (`\sqrt{\sqrt{...}}`等)でも計算時間は線形で完走するが、生成されるHTMLはネスト段数に比例して
// 肥大化する(例: `\sqrt{}`を500段ネストしただけの数式1つから約500KBのHTMLが生成される)。
// これを実際のブラウザ側でレイアウト・ペイントする段になると、タブがフリーズ・クラッシュしうる。
// KaTeX自体にネスト深度を制限するオプションは無いため、レンダリングを試みる前に独自にチェックする

export const FORMULA_MAX_LENGTH = 1000;
export const FORMULA_MAX_NEST_DEPTH = 3;

export function exceedsMaxNestDepth(formula: string, maxDepth: number): boolean {
	let depth = 0;
	for (const ch of formula) {
		if (ch === '{') {
			depth++;
			if (depth > maxDepth) return true;
		} else if (ch === '}') {
			depth = Math.max(0, depth - 1);
		}
	}
	return false;
}

export function isFormulaTooComplex(formula: string): boolean {
	return formula.length > FORMULA_MAX_LENGTH || exceedsMaxNestDepth(formula, FORMULA_MAX_NEST_DEPTH);
}
