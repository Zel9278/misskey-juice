/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: 小説エディター(CodeMirror 6)の拡張。小説ビューワーが解釈する記法(ルビ・傍点などの注記・章タイトル・
// 区切り線・改ページ)への色付け、検索・置換、括弧・字下げの自動入力、書いている行を真ん中に保つ表示など

import { Decoration, EditorView, MatchDecorator, ViewPlugin, keymap, placeholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { ChangeSpec, Extension } from '@codemirror/state';
import { novelEditorSettings } from '@/utility/novel-draft.js';

// 記法ごとの色分け。ビューワーの解釈と同じ範囲に付ける(先に書いたものが優先される)
const NOTATION_PATTERN = new RegExp([
	// ルビ(pixiv形式・MFM)
	/\[\[rb:[^\]\n]*\]\]/.source,
	/\$\[ruby [^\]\n]+\]/.source,
	// ルビ(青空文庫形式。｜・＊などで基底を示すもの・直前の漢字が基底になるもの)
	/[｜|＊*][^｜|＊*《\n]+《[^》\n]+》/.source,
	/《[^》\n]+》/.source,
	// 注記(傍点・字下げなど)
	/［＃[^］\n]*］/.source,
	// 章タイトル
	/\[chapter:[^\]\n]*\]/.source,
	// pixiv小説のリンク・ページ移動・画像
	/\[\[jumpuri:[^\]\n]*\]\]/.source,
	/\[(?:jump|pixivimage):[^\]\n]*\]/.source,
	// 改ページ・区切り線(それだけの行)
	/^[ \t\u3000]*\[newpage\][ \t\u3000]*$/.source,
	/^-{3,}$/.source,
	// 太字・打ち消し線・斜体(1行の中で閉じているもの)
	/\*\*(?!\s)[^\n]+?(?<!\s)\*\*/.source,
	/~~(?!\s)[^\n]+?(?<!\s)~~/.source,
	/\*(?![\s*])[^*\n]+?(?<!\s)\*/.source,
].join('|'), 'gm');

function notationClass(text: string): string {
	if (text.startsWith('[[rb:') || text.startsWith('$[ruby') || text.includes('《')) return 'cm-novel-ruby';
	if (text.startsWith('［＃') || text.startsWith('[[jumpuri:') || text.startsWith('[jump:') || text.startsWith('[pixivimage:')) return 'cm-novel-annotation';
	if (text.startsWith('[chapter:')) return 'cm-novel-chapter';
	if (text.startsWith('**')) return 'cm-novel-bold';
	if (text.startsWith('~~')) return 'cm-novel-strike';
	if (text.startsWith('*')) return 'cm-novel-italic';
	return 'cm-novel-break';
}

const notationMatcher = new MatchDecorator({
	regexp: NOTATION_PATTERN,
	decoration: match => Decoration.mark({ class: notationClass(match[0]) }),
});

const notationHighlight = ViewPlugin.fromClass(class {
	decorations: DecorationSet;

	constructor(view: EditorView) {
		this.decorations = notationMatcher.createDeco(view);
	}

	update(update: ViewUpdate): void {
		this.decorations = notationMatcher.updateDeco(update, this.decorations);
	}
}, {
	decorations: v => v.decorations,
});

// 書体・文字の大きさ・行の高さは、エディターを包む要素のCSS変数で変える(設定を変えても作り直さない)
const novelTheme = EditorView.theme({
	'&': {
		color: 'var(--MI_THEME-fg)',
		backgroundColor: 'transparent',
		fontSize: 'var(--novelEditorFontSize, 16px)',
	},
	'&.cm-focused': {
		outline: 'none',
	},
	'.cm-scroller': {
		fontFamily: 'var(--novelEditorFontFamily, inherit)',
		lineHeight: 'var(--novelEditorLineHeight, 1.9)',
	},
	'.cm-content': {
		padding: '16px',
		caretColor: 'var(--MI_THEME-accent)',
	},
	'.cm-cursor, .cm-dropCursor': {
		borderLeftColor: 'var(--MI_THEME-accent)',
	},
	'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
		backgroundColor: 'color(from var(--MI_THEME-accent) srgb r g b / 0.25)',
	},
	'.cm-placeholder': {
		color: 'var(--MI_THEME-fgTransparentWeak)',
	},
	'.cm-novel-ruby': {
		color: 'var(--MI_THEME-accent)',
	},
	'.cm-novel-annotation': {
		color: 'var(--MI_THEME-link)',
	},
	'.cm-novel-chapter': {
		color: 'var(--MI_THEME-accent)',
		fontWeight: 'bold',
	},
	'.cm-novel-bold': {
		fontWeight: 'bold',
	},
	'.cm-novel-strike': {
		textDecoration: 'line-through',
	},
	'.cm-novel-italic': {
		fontStyle: 'italic',
	},
	'.cm-novel-break': {
		color: 'var(--MI_THEME-fgTransparentWeak)',
		fontWeight: 'bold',
	},
	// 検索・置換の欄
	'.cm-panels': {
		backgroundColor: 'var(--MI_THEME-panel)',
		color: 'var(--MI_THEME-fg)',
	},
	'.cm-panels-top': {
		borderBottom: 'solid 1px var(--MI_THEME-divider)',
	},
	'.cm-panels-bottom': {
		borderTop: 'solid 1px var(--MI_THEME-divider)',
	},
	'.cm-search': {
		fontSize: '14px',
		lineHeight: '1.6',
		fontFamily: 'var(--MI-font, inherit)',
	},
	'.cm-textfield': {
		padding: '4px 8px',
		border: 'solid 1px var(--MI_THEME-divider)',
		borderRadius: '6px',
		background: 'var(--MI_THEME-bg)',
		color: 'var(--MI_THEME-fg)',
		fontSize: '14px',
	},
	'.cm-button': {
		padding: '4px 10px',
		border: 'none',
		borderRadius: '6px',
		backgroundImage: 'none',
		background: 'var(--MI_THEME-buttonBg)',
		color: 'var(--MI_THEME-fg)',
		fontSize: '13px',
	},
	'.cm-button:hover': {
		background: 'var(--MI_THEME-buttonHoverBg)',
	},
	'.cm-search label': {
		fontSize: '13px',
	},
	'.cm-searchMatch': {
		backgroundColor: 'color(from var(--MI_THEME-warn) srgb r g b / 0.3)',
	},
	'.cm-searchMatch-selected': {
		backgroundColor: 'color(from var(--MI_THEME-accent) srgb r g b / 0.4)',
	},
});

// JUICE: 括弧の組。開き括弧を打ったら閉じ括弧も入れる
const BRACKETS: Record<string, string> = {
	'「': '」',
	'『': '』',
	'（': '）',
	'【': '】',
	'〔': '〕',
	'〈': '〉',
	'《': '》',
	'“': '”',
};
const CLOSING_BRACKETS = new Set(Object.values(BRACKETS));

/**
 * 打った文字に合わせて、閉じ括弧を補う・自分で打った閉じ括弧と補った閉じ括弧を重ねない・
 * 自動で入れた字下げの直後に括弧を打ったら字下げを消す(会話文の頭は字下げしないため)。
 * 日本語入力の変換中に文字を変えると入力が壊れるので、確定した後で行う
 */
function assistInput(update: ViewUpdate): void {
	if (!update.docChanged || !(novelEditorSettings.autoCloseBrackets || novelEditorSettings.autoIndent)) return;
	if (!update.transactions.some(tr => tr.isUserEvent('input.type'))) return;
	const inserted: { from: number; to: number; text: string }[] = [];
	update.changes.iterChanges((_fromA, _toA, fromB, toB, text) => inserted.push({ from: fromB, to: toB, text: text.toString() }));
	if (inserted.length !== 1) return;
	const { from, to, text } = inserted[0];
	const selection = update.state.selection.main;
	if (!selection.empty || selection.head !== to || text === '') return;
	const view = update.view;
	const doc = update.state.doc;
	window.setTimeout(() => {
		// 変換中・その後さらに打った場合はやめる
		if (view.composing || view.state.doc !== doc) return;
		const changes: ChangeSpec[] = [];
		let cursor = to;
		if (novelEditorSettings.autoCloseBrackets) {
			const last = text.slice(-1);
			const next = doc.sliceString(to, to + 1);
			if (CLOSING_BRACKETS.has(last) && next === last) {
				// 補っておいた閉じ括弧の手前で同じ閉じ括弧を打ったら、重ねずに1つにする
				changes.push({ from: to, to: to + 1 });
			} else {
				// 打った文字の中で閉じていない最後の開き括弧を、閉じてあげる
				let open: string | null = null;
				for (const ch of text) {
					if (BRACKETS[ch] != null) open = ch;
					else if (open != null && ch === BRACKETS[open]) open = null;
				}
				if (open != null && next !== BRACKETS[open]) changes.push({ from: to, insert: BRACKETS[open] });
			}
		}
		if (novelEditorSettings.autoIndent && BRACKETS[text[0]] != null) {
			const line = doc.lineAt(from);
			if (doc.sliceString(line.from, from) === '\u3000') {
				changes.push({ from: line.from, to: from });
				cursor -= 1;
			}
		}
		if (changes.length === 0) return;
		view.dispatch({ changes, selection: { anchor: cursor }, userEvent: 'input.assist' });
	}, 0);
}

// 書いている行を画面の真ん中に保つ(タイプライターのように)
function keepCursorCentered(update: ViewUpdate): void {
	if (!novelEditorSettings.typewriter || !(update.selectionSet || update.docChanged) || !update.view.hasFocus) return;
	const view = update.view;
	window.setTimeout(() => {
		if (view.composing) return;
		view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }) });
	}, 0);
}

// 改行したら、段落の頭に全角スペースを入れる
const autoIndentKeymap = keymap.of([{
	key: 'Enter',
	run: (view) => {
		if (!novelEditorSettings.autoIndent) return false;
		view.dispatch(view.state.replaceSelection('\n\u3000'), { scrollIntoView: true, userEvent: 'input' });
		return true;
	},
}]);

export function novelEditorExtensions(options: {
	placeholder: string;
	label: string;
	phrases: Record<string, string>;
	onChange: (text: string) => void;
	onSelectionChange: (selectedText: string) => void;
}): Extension[] {
	return [
		history(),
		autoIndentKeymap,
		keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap]),
		search({ top: true }),
		EditorState.phrases.of(options.phrases),
		EditorView.lineWrapping,
		EditorView.contentAttributes.of({ 'aria-label': options.label, spellcheck: 'false' }),
		placeholder(options.placeholder),
		notationHighlight,
		novelTheme,
		EditorView.updateListener.of(update => {
			if (update.docChanged) options.onChange(update.state.doc.toString());
			if (update.selectionSet || update.docChanged) {
				const { from, to } = update.state.selection.main;
				options.onSelectionChange(from === to ? '' : update.state.sliceDoc(from, to));
			}
			assistInput(update);
			keepCursorCentered(update);
		}),
	];
}
