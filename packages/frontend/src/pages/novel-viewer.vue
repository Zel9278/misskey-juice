<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions">
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div v-if="appearNote" class="_margin _gaps_s">
			<div :class="$style.author">
				<MkAvatar :class="$style.avatar" :user="appearNote.user" link preview/>
				<div :class="$style.authorText">
					<MkA v-user-preview="appearNote.userId" :class="$style.authorName" :to="userPage(appearNote.user)"><MkUserName :user="appearNote.user"/></MkA>
					<MkAcct :class="$style.authorAcct" :user="appearNote.user"/>
				</div>
			</div>
			<p v-if="appearNote.cw != null" :class="$style.cw">
				<Mfm v-if="appearNote.cw !== ''" :text="appearNote.cw" :author="appearNote.user" :nyaize="'respect'"/>
				<MkCwButton v-model="showContent" :text="appearNote.text" :renote="appearNote.renote" :files="appearNote.files" :poll="appearNote.poll"/>
			</p>
			<div v-show="appearNote.cw == null || showContent">
				<div
					ref="outerEl"
					:class="$style.body"
					:data-mode="writingMode"
					:data-theme="theme"
					:style="bodyStyle"
					@touchstart="writingMode === 'vertical' ? onTouchStart($event) : undefined"
					@touchend="writingMode === 'vertical' ? onTouchEnd($event) : undefined"
				>
					<!-- JUICE: isNovelなノートに.txtファイルが添付されていれば、そちらを本文として読み込む
					(文字数上限に収まらない長編向け)。読み込み中/失敗時はここに専用の表示を出す -->
					<div v-if="novelFileLoading" :class="$style.fileState"><MkLoading/></div>
					<MkError v-else-if="novelFileError" :class="$style.fileState" @retry="novelFile && loadNovelFile(novelFile)"/>
					<!-- JUICE: 縦書き見開きモード。画面が十分広いときだけ、同じ本文を2つのパネルへ
					少しずらして表示し、本を開いたときのような2ページ分割にする(CSS多段組は
					vertical-rl環境で機能しないため使えず、パネルを2つ並べる方式にしている) -->
					<div v-else-if="writingMode === 'vertical' && isSpread" :class="$style.spread">
						<div :data-mode="writingMode" :class="$style.panel">
							<div :ref="(el) => setPanelViewportEl(0, el as HTMLElement | null)" :data-mode="writingMode" :class="$style.panelViewport">
								<div :ref="(el) => setPanelInnerEl(0, el as HTMLElement | null)" :class="$style.panelInner">
									<template v-for="(chapter, i) in chapters" :key="i">
										<div v-if="i > 0" :class="$style.chapterBreak" aria-hidden="true">⁂</div>
										<span :ref="(el) => setChapterMarkerEl(i, el as HTMLElement | null)" :class="$style.chapterMarker"></span>
										<Mfm :text="chapter.text" :author="appearNote.user" :nyaize="'respect'" :emojiUrls="appearNote.emojis" class="_selectable"/>
									</template>
								</div>
							</div>
						</div>
						<div :class="$style.spreadGutter" aria-hidden="true"></div>
						<!-- JUICE: 左パネルは「次ページのめくれ具合」を見せる視覚上の複製に過ぎず、本文としては
						右パネル(主パネル)側が唯一の正本。読み上げ・タブ移動・選択で本文が二重に扱われない
						よう、aria-hidden+inertで補助技術から隠し、選択もCSS側で禁止する。本文が右パネルで
						最終ページに達し、次ページの中身が存在しないときは、同じ内容を複製して見せるのではなく
						見開きの裏面として空白のまま(本を閉じる直前の白紙ページのイメージ)にする -->
						<div :data-mode="writingMode" :class="$style.panel" aria-hidden="true" inert>
							<div :ref="(el) => setPanelViewportEl(1, el as HTMLElement | null)" :data-mode="writingMode" :class="$style.panelViewport">
								<div :ref="(el) => setPanelInnerEl(1, el as HTMLElement | null)" :class="$style.panelInner">
									<template v-if="currentPage < pageCount">
										<template v-for="(chapter, i) in chapters" :key="i">
											<div v-if="i > 0" :class="$style.chapterBreak" aria-hidden="true">⁂</div>
											<Mfm :text="chapter.text" :author="appearNote.user" :nyaize="'respect'" :emojiUrls="appearNote.emojis"/>
										</template>
									</template>
								</div>
							</div>
						</div>
					</div>
					<div v-else :data-mode="writingMode" :class="$style.panel">
						<div :ref="(el) => setPanelViewportEl(0, el as HTMLElement | null)" :data-mode="writingMode" :class="$style.panelViewport">
							<div :ref="(el) => setPanelInnerEl(0, el as HTMLElement | null)" :class="$style.panelInner">
								<!-- JUICE: 「小説家になろう」等を踏まえ、横書き時は各章の境目ごとに目次・前後の章への
								導線を置く(文書の最初と最後だけだと、読んでいる途中の章からは遠くて使えないため) -->
								<template v-for="(chapter, i) in chapters" :key="i">
									<div v-if="writingMode === 'horizontal' && chapters.length > 1" :class="$style.chapterNav">
										<button class="_button" :class="$style.chapterNavLink" :disabled="i === 0" @click="jumpToChapter(i - 1)"><i class="ti ti-chevron-left"></i> {{ i18n.ts._juice.novelViewerPrevChapter }}</button>
										<button class="_button" :class="$style.chapterNavLink" @click="openToc">{{ i18n.ts._juice.novelViewerToc }}</button>
										<button class="_button" :class="$style.chapterNavLink" :disabled="i === chapters.length - 1" @click="jumpToChapter(i + 1)">{{ i18n.ts._juice.novelViewerNextChapter }} <i class="ti ti-chevron-right"></i></button>
									</div>
									<div v-else-if="i > 0" :class="$style.chapterBreak" aria-hidden="true">⁂</div>
									<span :ref="(el) => setChapterMarkerEl(i, el as HTMLElement | null)" :class="$style.chapterMarker"></span>
									<Mfm :text="chapter.text" :author="appearNote.user" :nyaize="'respect'" :emojiUrls="appearNote.emojis" class="_selectable"/>
								</template>
								<div v-if="writingMode === 'horizontal' && chapters.length > 1" :class="$style.chapterNav">
									<button class="_button" :class="$style.chapterNavLink" @click="jumpToChapter(chapters.length - 2)"><i class="ti ti-chevron-left"></i> {{ i18n.ts._juice.novelViewerPrevChapter }}</button>
									<button class="_button" :class="$style.chapterNavLink" @click="openToc">{{ i18n.ts._juice.novelViewerToc }}</button>
									<button class="_button" :class="$style.chapterNavLink" disabled>{{ i18n.ts._juice.novelViewerNextChapter }} <i class="ti ti-chevron-right"></i></button>
								</div>
							</div>
						</div>
					</div>
				</div>
				<div v-if="writingMode === 'vertical'" :class="$style.pager">
					<button v-tooltip="i18n.ts._juice.novelViewerNextPage" class="_button" :class="$style.pagerButton" :disabled="!canGoNext" :aria-label="i18n.ts._juice.novelViewerNextPage" @click="turnPage('next')"><i class="ti ti-chevron-left"></i></button>
					<span :class="$style.pagerCount">{{ isSpread && currentPage < pageCount ? i18n.tsx._juice.novelViewerPageRange({ from: currentPage, to: currentPage + 1 }) : currentPage }} / {{ pageCount }}</span>
					<button v-tooltip="i18n.ts._juice.novelViewerPrevPage" class="_button" :class="$style.pagerButton" :disabled="!canGoPrev" :aria-label="i18n.ts._juice.novelViewerPrevPage" @click="turnPage('prev')"><i class="ti ti-chevron-right"></i></button>
				</div>
			</div>
			<MkA :to="notePage(appearNote)" :class="$style.footerLink"><MkTime :time="appearNote.createdAt" mode="detail" colored/></MkA>
		</div>
		<MkError v-else-if="error" @retry="fetchNote()"/>
		<MkLoading v-else/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import * as os from '@/os.js';
import MkCwButton from '@/components/MkCwButton.vue';
import MkNovelViewerColorPicker from '@/components/MkNovelViewerColorPicker.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { store } from '@/store.js';
import { getAppearNote } from '@/utility/get-appear-note.js';
import { userPage } from '@/filters/user.js';
import { notePage } from '@/filters/note.js';
import { pleaseLogin } from '@/utility/please-login.js';

const props = defineProps<{
	noteId: string;
}>();

const note = ref<Misskey.entities.Note | null>(null);
const error = ref();
const showContent = ref(false);
const outerEl = useTemplateRef<HTMLDivElement>('outerEl');

// JUICE: 縦書き見開き(2ページ分割)用。3層構造になっている:
// .panel(常にflexの割り当て幅=100%のまま、「使える幅」の測定基準) >
// .panelViewport(JSが1ページぶんの実測px幅を明示的に指定してoverflow:hiddenでクリップする窓) >
// .panelInner(本文本体、自然な内容量ぶんだけ幅を持つ)。
// ページ送りはinnerにtransform: translateXを直接指定するだけの単純な仕組みにする。scrollLeftを
// 使わないのは、パネルが差し替わった直後(見開き切替直後など)はブラウザ側のオーバーフロー計算
// (scrollWidth)がまだ済んでおらず、要求したscrollLeftが0へ強制的に丸められて二度と正しい
// 位置に戻らなくなる不具合が起きたため。translateXならオーバーフロー量を一切問わずそのままの
// 位置に反映されるので、この種のタイミング問題が起こりようがない
const panelInnerEls = ref<(HTMLDivElement | null)[]>([]);
const panelViewportEls = ref<(HTMLDivElement | null)[]>([]);

function setPanelInnerEl(i: number, el: HTMLElement | null): void {
	panelInnerEls.value[i] = el as HTMLDivElement | null;
}

function setPanelViewportEl(i: number, el: HTMLElement | null): void {
	panelViewportEls.value[i] = el as HTMLDivElement | null;
}

function primaryInnerEl(): HTMLDivElement | null {
	return panelInnerEls.value[0] ?? null;
}

function primaryViewportEl(): HTMLDivElement | null {
	return panelViewportEls.value[0] ?? null;
}

// JUICE: このページの本文カラムは `_spacer` の --MI_SPACER-w: 800px で頭打ちになるため、
// ウインドウをどれだけ広げてもouterElのclientWidthは800pxを超えない。閾値はこの上限内で
// 実際に見開きへ到達できる値にする(380pxのままだとchrome分を差し引いた瞬間に見開きが
// 永久に発動しなくなる)
const SPREAD_MIN_PANEL_WIDTH = 320;
// JUICE: outerElのclientWidthには縦書き時のpadding(20px×2)とパネル間のspreadGutter(1px+
// margin 12px×2)がそのまま含まれてしまい、そのまま閾値と比べるとパネル実幅が想定より狭い
// うちから見開きになってしまう。既知のchrome分をあらかじめ差し引いてから判定する
const SPREAD_CHROME_WIDTH = 40 + 25;
const isSpread = ref(false);

function updateSpreadMode(): void {
	const el = outerEl.value;
	isSpread.value = writingMode.value === 'vertical' && !!el && (el.clientWidth - SPREAD_CHROME_WIDTH) >= SPREAD_MIN_PANEL_WIDTH * 2;
}

const appearNote = computed(() => note.value ? (getAppearNote(note.value) ?? note.value) : null);

// JUICE: 添付された.txtファイルがあれば、本文の代わりにそちらを小説の本体として読む。
// ノート本文だけだと文字数上限に収まらない長編を投稿できないための機能
// .txtが複数添付されている場合は、ドライブで「小説」フラグを付けたファイルを優先する
const novelFile = computed(() => {
	const textFiles = appearNote.value?.files?.filter(f => f.type === 'text/plain' || f.name.toLowerCase().endsWith('.txt')) ?? [];
	return textFiles.find(f => f.isNovel) ?? textFiles[0] ?? null;
});
const novelFileContent = ref<string | null>(null);
const novelFileLoading = ref(false);
const novelFileError = ref<unknown>(null);

function decodeTextFile(buffer: ArrayBuffer): string {
	// JUICE: ブラウザ標準のTextDecoderにはエンコーディング自動判定機能が無いため、
	// 「UTF-8として厳密デコードして失敗したらShift-JISとみなす」という単純なヒューリスティックを使う。
	// 青空文庫形式のテキストファイル等、日本語の.txtファイルの多くはUTF-8かShift-JISのいずれかで、
	// 正しいShift-JISバイト列が同時に正しいUTF-8として解釈できることは実質無いため、この判定で十分実用に足る
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
	} catch {
		return new TextDecoder('shift-jis').decode(buffer);
	}
}

// JUICE: KeepAliveで同じインスタンスが別ノートに使い回されるため、前のノートのファイル取得が
// 後から終わっても本文を上書きしないよう、最新の読み込み要求かどうかを世代番号で確認する
let novelFileLoadGeneration = 0;

async function loadNovelFile(file: Misskey.entities.DriveFile): Promise<void> {
	const generation = ++novelFileLoadGeneration;
	novelFileLoading.value = true;
	novelFileError.value = null;
	try {
		const res = await window.fetch(file.url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const content = decodeTextFile(await res.arrayBuffer());
		if (generation !== novelFileLoadGeneration) return;
		novelFileContent.value = content;
	} catch (err) {
		if (generation !== novelFileLoadGeneration) return;
		novelFileError.value = err;
	} finally {
		if (generation === novelFileLoadGeneration) novelFileLoading.value = false;
	}
}

watch(novelFile, (file) => {
	novelFileContent.value = null;
	if (file) {
		loadNovelFile(file);
	} else {
		// JUICE: ファイル無しのノートへ切り替わったら、読み込み中だった前のノートの結果は捨てる
		novelFileLoadGeneration++;
		novelFileLoading.value = false;
		novelFileError.value = null;
	}
}, { immediate: true });
// JUICE: store.sはPizzaxの非リアクティブなスナップショット(プレーンオブジェクト)なので、
// テンプレートで使う値は必ずリアクティブなstore.r.xxx.valueから読む(mediaTimelineSrc等の
// 既存箇所もprefer.r.xxx.valueを使っている慣習に合わせる)。store.sはイベントハンドラ内での
// 単発読み取り(saveProgress/resetPager等)にのみ使う
const writingMode = computed(() => store.r.novelViewerWritingMode.value);
const fontSize = computed({
	get: () => store.r.novelViewerFontSize.value,
	set: (v: number) => store.set('novelViewerFontSize', v),
});
const theme = computed({
	get: () => store.r.novelViewerTheme.value,
	set: (v: 'auto' | 'light' | 'sepia' | 'dark' | 'custom') => store.set('novelViewerTheme', v),
});
const fontFamily = computed({
	get: () => store.r.novelViewerFontFamily.value,
	set: (v: 'default' | 'mincho' | 'gothic') => store.set('novelViewerFontFamily', v),
});
const customTextColor = computed(() => store.r.novelViewerCustomTextColor.value);
const customBgColor = computed(() => store.r.novelViewerCustomBgColor.value);

// JUICE: フォントサイズ・書体・(カスタムテーマ時の)文字色/背景色をまとめてinline styleで適用する。
// data-theme="custom"はプリセット4色と違ってSCSS側で固定値を持てないため、ここで直接上書きする
const fontFamilyStack: Record<'default' | 'mincho' | 'gothic', string | null> = {
	default: null,
	mincho: '"Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif',
	gothic: '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif',
};
const bodyStyle = computed(() => {
	const style: Record<string, string> = { fontSize: `${fontSize.value}em` };
	const family = fontFamilyStack[fontFamily.value];
	if (family) style.fontFamily = family;
	if (theme.value === 'custom') {
		style.color = customTextColor.value;
		style.background = customBgColor.value;
	}
	return style;
});

const paragraphIndent = computed({
	get: () => store.r.novelViewerParagraphIndent.value,
	set: (v: boolean) => store.set('novelViewerParagraphIndent', v),
});
const aozoraNotation = computed({
	get: () => store.r.novelViewerAozoraNotation.value,
	set: (v: boolean) => store.set('novelViewerAozoraNotation', v),
});

// JUICE: 青空文庫形式のテキストによくある入力者注記を解釈する。対応するのはルビと字下げブロックのみ
// (アオゾラ形式は種類が非常に多く、全種対応はしない)。対応しきれない［＃...］注記は表示から取り除く
function convertAozoraNotation(text: string): string {
	let result = text;

	// 青空文庫形式の冒頭に定型で入る「テキスト中に現れる記号について」の凡例ブロック(罫線で
	// 前後を挟まれている)は本編の一部ではないので、章として数えないようまるごと取り除く。
	// この罫線と本編中の(章区切り等の用途で使われる)---を区別するため、凡例特有の見出し文言が
	// 含まれるブロックだけを対象にする
	result = result.replace(/^-{3,}\n([\s\S]*?)\n-{3,}\n?/m, (m, inner: string) => (inner.includes('テキスト中に現れる記号について') ? '' : m));

	// ルビ: ｜基底《よみ》(基底の範囲を｜で明示) → MFMのルビ関数 $[ruby 基底 よみ] に変換
	result = result.replace(/／?｜([^｜《]+)《([^》]+)》/g, (_m, base: string, reading: string) => `$[ruby ${base} ${reading}]`);
	// ｜が無い場合、直前の連続した漢字(＋一部の繰り返し記号)がルビの基底になる青空文庫の規則
	result = result.replace(/([\u4E00-\u9FFF\u3005\u3006\u30F6]+)《([^》]+)》/g, (_m, base: string, reading: string) => `$[ruby ${base} ${reading}]`);

	// ［＃ここからN字下げ］～［＃ここで字下げ終わり］ブロックは、各行の先頭に全角スペースをN個補う
	result = result.replace(/［＃ここから(\d+)字下げ］\n?([\s\S]*?)［＃ここで字下げ終わり］\n?/g, (_m, n: string, inner: string) => {
		const indent = '\u3000'.repeat(Number(n));
		return inner.split('\n').map(line => (line.length > 0 ? indent + line : line)).join('\n') + '\n';
	});

	// 対応しきれない残りの入力者注記(［＃…］)は、注記自体を表示に残さないよう取り除く
	result = result.replace(/［＃[^］]*］/g, '');

	return result;
}

// JUICE: 行頭に全角/半角スペースが無い行へ全角スペースを補い、段落の字下げにする。
// 既に字下げされている行(青空文庫形式のテキスト等でよくある)はそのままにして二重字下げを避ける
function applyParagraphIndent(text: string): string {
	return text.split('\n').map(line => (line.length === 0 || /^[\u3000 ]/.test(line) ? line : `\u3000${line}`)).join('\n');
}

// JUICE: 本文中の区切り線(独立行の---等)を章境界として扱う。1件も無ければ全文が1章になる。
// 青空文庫記法の変換(凡例ブロックの除去含む)は章分割より前に、全文に対して1回だけ行う
const chapters = computed(() => {
	const text = novelFileContent.value ?? appearNote.value?.text;
	if (!text) return [{ text: '' }];
	let normalized = text.replace(/\r\n/g, '\n');
	if (aozoraNotation.value) normalized = convertAozoraNotation(normalized);
	const parts = normalized.split(/\n{0,2}^-{3,}$\n{0,2}/m).map(t => t.trim()).filter(t => t.length > 0);
	const chapterTexts = parts.length > 0 ? parts : [normalized];
	return chapterTexts.map(t => ({ text: paragraphIndent.value ? applyParagraphIndent(t) : t }));
});

let chapterMarkerEls: (HTMLElement | null)[] = [];

function setChapterMarkerEl(i: number, el: HTMLElement | null): void {
	chapterMarkerEls[i] = el;
}

// JUICE: 縦書きモードは1画面分の幅ごとに右から左へページめくり式で読む。見開き時はinner2枚を
// 同期させ、右(panelInnerEls[0])が基準ページ・左(panelInnerEls[1])が次ページを表示する
const pageCount = ref(1);
const currentPage = ref(1);
const canGoNext = computed(() => currentPage.value + (isSpread.value ? 1 : 0) < pageCount.value);
const canGoPrev = computed(() => currentPage.value > 1);

// JUICE: vertical-rlの1行(1列)の幅は通常line-heightと一致するが、ルビ付きの行はルビの分だけ
// 素の行より幅が広くなり、line-heightをそのまま単位にすると行の途中でページが切れてしまう
// (見切れる)。実際に描画されたルビ要素の最大幅を測り、それをline-heightとして明示的に
// 上書きすることで、ルビの有無に関わらずすべての行の幅を揃える(揃っていれば「幅の整数倍で
// ページを区切る」という単純な計算がそのまま安全に成り立つ)
function applyUniformColumnWidth(inner: HTMLDivElement): number {
	inner.style.removeProperty('line-height');
	const baseLineHeight = parseFloat(getComputedStyle(inner).lineHeight) || 32;
	let columnWidth = baseLineHeight;
	for (const ruby of inner.querySelectorAll('ruby')) {
		// JUICE: vertical-rlでは<rt>(ルビ本体)が<ruby>自身のgetBoundingClientRectの外に
		// はみ出して描画される(<ruby>の矩形はベース文字の範囲までしか含まない)。<ruby>だけを
		// 測るとルビの分の幅を過小評価してしまい、実際の列幅より狭いline-heightを設定して
		// しまう結果、ルビが列からはみ出て隣の列と重なって見切れる。<rt>を含めた実際の
		// 外接矩形の幅を測る
		const rubyRect = ruby.getBoundingClientRect();
		let left = rubyRect.left;
		let right = rubyRect.right;
		for (const rt of ruby.querySelectorAll('rt')) {
			const rtRect = rt.getBoundingClientRect();
			left = Math.min(left, rtRect.left);
			right = Math.max(right, rtRect.right);
		}
		columnWidth = Math.max(columnWidth, right - left);
	}
	columnWidth = Math.ceil(columnWidth);
	inner.style.lineHeight = `${columnWidth}px`;
	return columnWidth;
}

// JUICE: ルビが多い文章では、均一なページ幅(行幅の整数倍)だと「たまたまルビがページ境界に
// かかる」ケースをどうしても避けられない(境界を1行分ずらしても、別のルビが今度はそこに
// かかるだけ)。line-heightに指定した値と実際に描画される列の間隔がサブピクセル単位で
// 完全には一致しないため、ページを重ねるほど数px単位でズレるうえ、この文章はルビの密度が
// 高く(数十文字に1回程度)、大抵のページ境界の近くに何かしらルビが存在するため。
// そのため、ページ幅を機械的な均一割りにするのではなく、各ルビ(<rt>込みの外接矩形)の
// 本文先頭からの距離の範囲を求め、ページ境界がその範囲の内側に来る場合だけそのページを
// 少し短く切り上げてルビの手前で区切る(=ページごとに幅が微妙に前後する)
function getRubyZones(inner: HTMLDivElement): { start: number; end: number }[] {
	const innerRight = inner.getBoundingClientRect().right;
	const zones: { start: number; end: number }[] = [];
	for (const ruby of inner.querySelectorAll('ruby')) {
		const r = ruby.getBoundingClientRect();
		let left = r.left;
		let right = r.right;
		for (const rt of ruby.querySelectorAll('rt')) {
			const rtRect = rt.getBoundingClientRect();
			left = Math.min(left, rtRect.left);
			right = Math.max(right, rtRect.right);
		}
		// JUICE: 距離は「本文の先頭(=innerの右端)からどれだけ離れているか」。vertical-rlは
		// 右から左へ進むため、leftのほうが先頭からより遠い(distanceが大きい)
		zones.push({ start: innerRight - right, end: innerRight - left });
	}
	zones.sort((a, b) => a.start - b.start);
	return zones;
}

function computePageOffsets(inner: HTMLDivElement, naturalPageWidth: number, rubyZones: { start: number; end: number }[]): number[] {
	const total = inner.scrollWidth;
	if (naturalPageWidth <= 0 || total <= naturalPageWidth) return [0];
	const offsets = [0];
	let current = 0;
	while (current + naturalPageWidth < total) {
		let boundary = current + naturalPageWidth;
		const straddling = rubyZones.find(z => z.start > current && z.start < boundary && z.end > boundary);
		if (straddling) boundary = straddling.start;
		if (boundary <= current) boundary = current + naturalPageWidth;
		offsets.push(boundary);
		current = boundary;
	}
	return offsets;
}

// JUICE: パネル間で共有する単純な配列で十分(見開きの2パネルは同じ本文・同じフォント設定
// なので同じ内容になる)。offsets[i]は「ページi+1が始まる、本文先頭からの距離」
let primaryPageOffsets: number[] = [0];

function updatePageCount(): void {
	const inner = primaryInnerEl();
	const viewport = primaryViewportEl();
	// JUICE: 「使える幅」は.panelViewportの親である.panel(常にflexの割り当て幅=100%のまま)から
	// 測る。.panelViewport自身は後段でページ幅ちょうどに縮めるため、そちらを基準にすると
	// 次回計測時にはすでに縮んだ幅を「使える幅」と誤認してどんどん縮んでいってしまう
	const outer = viewport?.parentElement as HTMLDivElement | undefined;
	if (!inner || !viewport || !outer || outer.clientWidth === 0) return;
	const columnWidth = applyUniformColumnWidth(inner);
	const secondaryInner = panelInnerEls.value[1];
	// JUICE: 見開きの2パネルは同じ本文なので、CSSのline-height指定値を主パネル(右)から
	// そのままコピーする(数値を再計算して個別に指定すると、サブピクセルの丸め等でわずかに
	// 違う値になることがあり、2パネルの位置計算が前提とする「同じ列幅」が崩れて継ぎ目で
	// 内容が二重に見えていた)。同じCSS値・同じ本文なら実際の描画結果も一致するはず
	if (isSpread.value && secondaryInner) secondaryInner.style.lineHeight = inner.style.lineHeight;
	const naturalPageWidth = Math.max(1, Math.floor(outer.clientWidth / columnWidth)) * columnWidth;
	primaryPageOffsets = computePageOffsets(inner, naturalPageWidth, getRubyZones(inner));
	pageCount.value = Math.max(1, primaryPageOffsets.length);
}

// JUICE: しおり(直近50件まで、MkEmojiPicker.vueのrecentlyUsedEmojisと同じ方式で切り詰める)
function saveProgress(): void {
	const id = appearNote.value?.id;
	if (!id || writingMode.value !== 'vertical') return;
	const rest = Object.entries(store.s.novelViewerProgress)
		.filter(([key]) => key !== id)
		.sort((a, b) => b[1].updatedAt - a[1].updatedAt)
		.slice(0, 49);
	rest.push([id, { page: currentPage.value, updatedAt: Date.now() }]);
	store.set('novelViewerProgress', Object.fromEntries(rest));
}

// JUICE: transform: translateXで直接ページ位置を反映する(アニメーションなし)。scrollLeftは
// 使わない — ブラウザ側のオーバーフロー計算(scrollWidth)に依存するため、パネルが差し替わった
// 直後(見開き切替直後など)はまだ計算が終わっておらず、要求した位置が0へ強制的に丸められて
// 二度と正しい位置に戻らないことがあった。transformはオーバーフロー量を一切問わないので、
// このタイミング問題が起こりようがない。
// 符号はscrollLeftと逆: vertical-rlは内容がinnerの右端を起点に左へ伸びる(width: max-content)
// ため、後のページを見せるにはinnerを右へ(=正のtranslateX)ずらす必要がある。
// ページごとに幅が微妙に前後する(ルビを避けるため)ので、クリップする窓の幅もページごとに
// 都度合わせ直す
function setInnerPage(inner: HTMLDivElement, viewport: HTMLDivElement, page: number, offsets: number[]): void {
	const start = offsets[page - 1] ?? offsets[offsets.length - 1] ?? 0;
	const end = offsets[page] ?? inner.scrollWidth;
	viewport.style.width = `${Math.max(1, end - start)}px`;
	inner.style.transform = `translateX(${start}px)`;
}

function syncSecondaryPanel(): void {
	if (!isSpread.value) return;
	const secondaryInner = panelInnerEls.value[1];
	const secondaryViewport = panelViewportEls.value[1];
	if (!secondaryInner || !secondaryViewport) return;
	const secondaryPage = Math.min(currentPage.value + 1, pageCount.value);
	setInnerPage(secondaryInner, secondaryViewport, secondaryPage, primaryPageOffsets);
}

function applyLayout(targetPage: number): void {
	nextTick(() => {
		updateSpreadMode();
		// JUICE: isSpreadの変更はここで初めて反映されるリアクティブな状態で、実際のDOM(パネルが
		// 1枚か2枚か)への反映はさらに1tick遅れる。ここでnextTickを重ねずにpanelInnerEls/transform
		// を触ると、見開きに切り替わった直後は古いDOM(または未生成のパネル)を参照してしまう
		nextTick(async () => {
			const inner = primaryInnerEl();
			const viewport = primaryViewportEl();
			if (!inner || !viewport) return;
			// JUICE: Webフォントの読み込みが完了する前に幅を測ると、フォールバックフォントの
			// 字幅で計算してしまい、後から本来のフォントに置き換わった時点でページ境界がずれる
			// (最悪、行の途中で切れて見切れる)。document.fonts.readyを待ってから測る
			await window.document.fonts.ready;
			updatePageCount();
			let page = Math.min(Math.max(targetPage, 1), pageCount.value);
			// JUICE: 見開きは本と同じく(1,2)(3,4)…の組で表示し、右ページは常に奇数ページにする。
			// 目次からの移動等で偶数ページが指定されたときにそのまま右ページへ置くと、(2,3)の
			// ような組になって章の頭が左から右へ飛んで見え、以降のめくりもずれたままになっていた
			if (isSpread.value && page % 2 === 0) page -= 1;
			currentPage.value = page;
			setInnerPage(inner, viewport, currentPage.value, primaryPageOffsets);
			syncSecondaryPanel();
		});
	});
}

function resetPager(): void {
	const id = appearNote.value?.id;
	const saved = id ? store.s.novelViewerProgress[id]?.page : undefined;
	applyLayout(saved ?? 1);
}

function turnPage(direction: 'next' | 'prev'): void {
	const inner = primaryInnerEl();
	const viewport = primaryViewportEl();
	if (!inner || !viewport) return;
	if (direction === 'next' && !canGoNext.value) return;
	if (direction === 'prev' && !canGoPrev.value) return;
	// JUICE: 見開き時は基本2ページ分まとめてめくるが、終端付近では1ページ分しか動けないことがある
	// (全2ページ中の2ページ目からprevすると1ページ目にしか戻れない、等)ため、まず目標ページを
	// [1, pageCount]へクランプする
	const step = isSpread.value ? 2 : 1;
	const rawTarget = currentPage.value + (direction === 'next' ? step : -step);
	const targetPage = Math.min(Math.max(rawTarget, 1), pageCount.value);
	if (targetPage === currentPage.value) return;
	currentPage.value = targetPage;
	setInnerPage(inner, viewport, targetPage, primaryPageOffsets);
	syncSecondaryPanel();
	saveProgress();
}

function jumpToChapter(i: number): void {
	const marker = chapterMarkerEls[i];
	if (!marker) return;
	// JUICE: 横書きは通常のページスクロールなので、scrollIntoViewで移動するだけでよい。
	// ただしマーカー自体ではなく、その章の頭にある章ナビ(前の章/目次/次の章)を基準にする。
	// マーカー基準だとページ上部の固定ヘッダーの裏に章タイトルが隠れてしまい、移動したように
	// 見えなかった(章ナビ側はCSSのscroll-margin-topで固定ヘッダーの高さ分だけ下げて止める)
	if (writingMode.value === 'horizontal') {
		const target = (marker.previousElementSibling as HTMLElement | null) ?? marker;
		target.scrollIntoView({ behavior: 'instant', block: 'start' });
		return;
	}
	const inner = primaryInnerEl();
	if (!inner) return;
	// JUICE: 縦書きはtransformでページ送りするため(scrollIntoViewが効く対象がそもそも無い)、
	// マーカーの現在位置から直接ページ番号を計算する。inner/markerのgetBoundingClientRectの
	// 差は、現在のtransform量がどちらにも等しくかかっているぶん打ち消し合うため、transformの
	// 値に関係なく「本文の先頭からの絶対距離」がそのまま求まる
	const innerRect = inner.getBoundingClientRect();
	const markerRect = marker.getBoundingClientRect();
	const distanceFromStart = innerRect.right - markerRect.right;
	// primaryPageOffsetsの中でdistanceFromStart以下の最大の開始位置を含むページを探す
	let targetPage = 1;
	for (let p = 0; p < primaryPageOffsets.length; p++) {
		if (primaryPageOffsets[p] <= distanceFromStart) targetPage = p + 1;
		else break;
	}
	applyLayout(targetPage);
	saveProgress();
}

function openToc(ev: PointerEvent): void {
	os.popupMenu(chapters.value.map((chapter, i) => ({
		text: i18n.tsx._juice.novelViewerChapter({ n: i + 1 }),
		action: () => jumpToChapter(i),
	})), ev.currentTarget ?? ev.target ?? undefined);
}

function openSettings(ev: PointerEvent): void {
	os.popupMenu([{
		type: 'radio' as const,
		icon: 'ti ti-text-size',
		text: i18n.ts._juice.novelViewerFontSize,
		ref: fontSize,
		options: [
			{ label: i18n.ts._juice.novelViewerFontSizeSmall, value: 0.9 },
			{ label: i18n.ts._juice.novelViewerFontSizeMedium, value: 1.1 },
			{ label: i18n.ts._juice.novelViewerFontSizeLarge, value: 1.35 },
			{ label: i18n.ts._juice.novelViewerFontSizeXLarge, value: 1.6 },
		],
	}, {
		type: 'switch' as const,
		icon: 'ti ti-indent-increase',
		text: i18n.ts._juice.novelViewerParagraphIndent,
		caption: i18n.ts._juice.novelViewerParagraphIndentCaption,
		ref: paragraphIndent,
	}, {
		type: 'switch' as const,
		icon: 'ti ti-forms',
		text: i18n.ts._juice.novelViewerAozoraNotation,
		caption: i18n.ts._juice.novelViewerAozoraNotationCaption,
		ref: aozoraNotation,
	}, {
		type: 'radio' as const,
		icon: 'ti ti-typography',
		text: i18n.ts._juice.novelViewerFontFamily,
		ref: fontFamily,
		options: [
			{ label: i18n.ts._juice.novelViewerFontFamilyDefault, value: 'default' },
			{ label: i18n.ts._juice.novelViewerFontFamilyMincho, value: 'mincho' },
			{ label: i18n.ts._juice.novelViewerFontFamilyGothic, value: 'gothic' },
		],
	}, {
		type: 'radio' as const,
		icon: 'ti ti-palette',
		text: i18n.ts._juice.novelViewerTheme,
		ref: theme,
		options: [
			{ label: i18n.ts._juice.novelViewerThemeAuto, value: 'auto' },
			{ label: i18n.ts._juice.novelViewerThemeLight, value: 'light' },
			{ label: i18n.ts._juice.novelViewerThemeSepia, value: 'sepia' },
			{ label: i18n.ts._juice.novelViewerThemeDark, value: 'dark' },
			{ label: i18n.ts._juice.novelViewerThemeCustom, value: 'custom' },
		],
	}, {
		type: 'component' as const,
		component: markRaw(MkNovelViewerColorPicker),
	}], ev.currentTarget ?? ev.target ?? undefined);
}

let touchStartX = 0;
let touchStartY = 0;

function onTouchStart(ev: TouchEvent): void {
	touchStartX = ev.changedTouches[0]?.clientX ?? 0;
	touchStartY = ev.changedTouches[0]?.clientY ?? 0;
}

function onTouchEnd(ev: TouchEvent): void {
	const endX = ev.changedTouches[0]?.clientX ?? touchStartX;
	const endY = ev.changedTouches[0]?.clientY ?? touchStartY;
	const deltaX = endX - touchStartX;
	const deltaY = endY - touchStartY;
	if (Math.abs(deltaX) < 40) return;
	// JUICE: 縦スクロールの途中で指が横にぶれただけのときはページをめくらない
	if (Math.abs(deltaY) > Math.abs(deltaX)) return;
	// JUICE: 右スワイプ(指を右へ)で次ページ・左スワイプ(指を左へ)で前ページ
	turnPage(deltaX > 0 ? 'next' : 'prev');
}

// JUICE: iOS Safari等の「画面端からのスワイプで戻る/進む」はtouch-actionでは止まらないため、
// 縦書き本文の高さの範囲で画面端付近から始まったタッチだけ既定動作を止める(ページめくりの
// スワイプ開始位置が端に寄ったときに誤って前のページへ戻ってしまうのを防ぐ)
const EDGE_SWIPE_GUARD_WIDTH = 24;

function onWindowTouchStart(ev: TouchEvent): void {
	if (writingMode.value !== 'vertical' || outerEl.value == null) return;
	const touch = ev.touches[0];
	if (touch == null) return;
	if (touch.clientX > EDGE_SWIPE_GUARD_WIDTH && touch.clientX < window.innerWidth - EDGE_SWIPE_GUARD_WIDTH) return;
	const rect = outerEl.value.getBoundingClientRect();
	if (touch.clientY < rect.top || touch.clientY > rect.bottom) return;
	ev.preventDefault();
}

function onKeydown(ev: KeyboardEvent): void {
	if (writingMode.value !== 'vertical') return;
	// JUICE: 入力欄(投稿フォームのダイアログ・検索欄等)でのカーソル移動やIME変換中の
	// 矢印キーまでページめくりに奪わない
	if (ev.isComposing || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
	const target = ev.target;
	if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') != null)) return;
	if (ev.key === 'ArrowLeft') {
		turnPage('next');
	} else if (ev.key === 'ArrowRight') {
		turnPage('prev');
	}
}

function onResize(): void {
	if (writingMode.value !== 'vertical') return;
	const wasSpread = isSpread.value;
	updateSpreadMode();
	// JUICE: 見開き⇔単ページが切り替わらない範囲のリサイズでも、幅が変わればページ数もtransform量も
	// 変わる。毎回必ずapplyLayoutでページ境界へ位置を計算し直す
	if (isSpread.value !== wasSpread) {
		// JUICE: 見開き⇔単ページの切り替えはDOM構造(パネル数)も変わるため、マーカーを取り直す
		chapterMarkerEls = [];
	}
	applyLayout(currentPage.value);
}

// JUICE: Chrome(Android)等の、横方向のオーバースクロールで履歴を戻る/進む挙動を
// ビューワーを開いている間だけ無効化する(閉じたら元の値に戻す)
let prevRootOverscrollBehaviorX = '';
let listenersAttached = false;

// JUICE: ページはKeepAliveでキャッシュされ、別ページへ遷移してもunmountされないため、
// window側のリスナーとルート要素のスタイルはactivate/deactivateに合わせて付け外しする
function attachWindowListeners(): void {
	if (listenersAttached) return;
	listenersAttached = true;
	window.addEventListener('keydown', onKeydown);
	window.addEventListener('resize', onResize);
	window.addEventListener('touchstart', onWindowTouchStart, { passive: false });
	prevRootOverscrollBehaviorX = window.document.documentElement.style.overscrollBehaviorX;
	window.document.documentElement.style.overscrollBehaviorX = 'none';
}

function detachWindowListeners(): void {
	if (!listenersAttached) return;
	listenersAttached = false;
	window.removeEventListener('keydown', onKeydown);
	window.removeEventListener('resize', onResize);
	window.removeEventListener('touchstart', onWindowTouchStart);
	window.document.documentElement.style.overscrollBehaviorX = prevRootOverscrollBehaviorX;
}

onMounted(attachWindowListeners);
onActivated(attachWindowListeners);
onDeactivated(() => {
	detachWindowListeners();
	saveProgress();
});
onUnmounted(() => {
	detachWindowListeners();
	saveProgress();
});

watch([appearNote, writingMode, showContent, novelFileContent], () => {
	chapterMarkerEls = [];
	if (writingMode.value === 'vertical') resetPager();
});

// JUICE: 文字サイズ変更時は読んでいたページ位置を保ったまま再計測する(しおり位置には戻さない)
watch([fontSize, fontFamily, paragraphIndent, aozoraNotation], () => {
	if (writingMode.value === 'vertical') applyLayout(currentPage.value);
});

function fetchNote(): void {
	note.value = null;
	error.value = undefined;

	misskeyApi('notes/show', {
		noteId: props.noteId,
	}).then(res => {
		note.value = res;
	}).catch(err => {
		if (['fbcc002d-37d9-4944-a6b0-d9e29f2d33ab', '145f88d2-b03d-4087-8143-a78928883c4b'].includes(err.id)) {
			pleaseLogin({
				path: '/',
				message: err.id === 'fbcc002d-37d9-4944-a6b0-d9e29f2d33ab' ? i18n.ts.thisContentsAreMarkedAsSigninRequiredByAuthor : i18n.ts.signinOrContinueOnRemote,
				openOnRemote: {
					type: 'lookup',
					url: `https://${host}/notes/${props.noteId}`,
				},
			});
		}
		error.value = err;
	});
}

watch(() => props.noteId, fetchNote, {
	immediate: true,
});

function toggleWritingMode(): void {
	store.set('novelViewerWritingMode', store.s.novelViewerWritingMode === 'vertical' ? 'horizontal' : 'vertical');
}

const headerActions = computed(() => {
	const actions = [{
		text: i18n.ts._juice.novelViewerSettings,
		icon: 'ti ti-adjustments',
		handler: openSettings,
	}, {
		text: writingMode.value === 'vertical' ? i18n.ts._juice.novelViewerHorizontalMode : i18n.ts._juice.novelViewerVerticalMode,
		icon: 'ti ti-camera-rotate',
		handler: toggleWritingMode,
	}];
	if (chapters.value.length > 1) {
		actions.unshift({
			text: i18n.ts._juice.novelViewerToc,
			icon: 'ti ti-list',
			handler: openToc,
		});
	}
	return actions;
});

definePage(() => ({
	title: i18n.ts._juice.novelViewer,
}));
</script>

<style lang="scss" module>
.author {
	display: flex;
	align-items: center;
	gap: 12px;
}

.avatar {
	width: 48px;
	height: 48px;
}

.authorText {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.authorName {
	font-weight: bold;
}

.authorAcct {
	opacity: 0.7;
}

.cw {
	margin: 0 0 1em 0;
}

.body {
	line-height: 2;
	transition: background-color 0.2s ease, color 0.2s ease;

	// JUICE: 電子書籍リーダーの背景テーマ。autoはアプリのテーマに合わせたパネル色にする
	// (ページ背景と同色だと本文の範囲・角丸が分からないため)
	&[data-theme="auto"] {
		background: var(--MI_THEME-panel);
	}
	&[data-theme="light"] {
		background: #fff;
		color: #1a1a1a;
	}
	&[data-theme="sepia"] {
		background: #f4ecd8;
		color: #5b4636;
	}
	&[data-theme="dark"] {
		background: #000;
		color: #ddd;
	}

	&[data-mode="horizontal"] {
		// JUICE: 縦書きと揃えて、本文の周りに余白を取り背景を角丸にする
		padding: 20px 24px;
		border-radius: var(--MI-radius);
	}

	&[data-mode="vertical"] {
		height: 70vh;
		max-height: 720px;
		padding: 20px;
		border-radius: var(--MI-radius);
		// JUICE: 横方向のスワイプはページめくりに使うため、ブラウザ側の横パン(=Chrome等の
		// スワイプで戻る/進む)として扱わせない。縦スクロールとピンチズームは残す
		touch-action: pan-y pinch-zoom;
	}
}

.fileState {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 32px 0;
	writing-mode: horizontal-tb;
}

// JUICE: 縦書き見開き用のパネル2枚(右=現在ページ・左=次ページ)を並べる横並びコンテナ。
// 本を開いたときのように中央にspreadGutterで見た目の継ぎ目を入れる
.spread {
	display: flex;
	// JUICE: 縦書き(右→左)の見開きは、本を開いたときと同じく右ページ=現在ページ・左ページ=
	// 次ページになるべき。DOM順(panelEls[0]=現在・[1]=次)はそのままに、見た目だけrow-reverseで
	// 右→左へ並べ替える
	flex-direction: row-reverse;
	height: 100%;
}

.spreadGutter {
	flex-shrink: 0;
	width: 1px;
	margin: 0 12px;
	background: currentColor;
	opacity: 0.2;
}

.panel {
	height: 100%;

	.spread > & {
		flex: 1 1 0;
		min-width: 0;
	}

	// JUICE: 見開きの左パネル(次ページの見た目上の複製、aria-hidden+inert)はテキスト選択の
	// 対象からも外す
	.spread > &:last-child {
		user-select: none;
	}

	&[data-mode="horizontal"] {
		writing-mode: horizontal-tb;
	}

	&[data-mode="vertical"] {
		// JUICE: mixedだと英数字だけ横倒しに回転して周囲と向きが揃わないため、upright指定で
		// 英字・数字も1文字ずつそのまま縦に並べ、全体の向きを統一する
		writing-mode: vertical-rl;
		text-orientation: upright;
		// JUICE: .panel自体はクリップせず「使える幅」の測定基準として常にflexの割り当て幅
		// (100%)のまま保つ。実際にクリップする窓は子の.panelViewportが担う(理由は後述)
		width: 100%;
		max-width: 100%;
	}
}

.panelViewport {
	height: 100%;

	// JUICE: 幅は必ずJS側(setInnerPage)がそのページぶんの実測px値を明示的に設定する
	// (ルビを避けるためページごとに微妙に幅が前後する)。.panel(=100%固定)をそのまま
	// クリップ窓にすると、幅がページの実際の中身より広くなり(半端な余白)、ページを
	// 1つ進めても窓の端に前ページの残りがはみ出て見えてしまう(見開きの継ぎ目で内容が
	// 二重に見える不具合の原因だった)。めくり幅とクリップ幅を常に一致させる
	[data-mode="vertical"] > & {
		overflow: hidden;
	}
}

.panelInner {
	height: 100%;

	// JUICE: vertical-rlは1行ごとに右→左へ積み上がる自然な折り返しでwidth方向に伸びる
	// (CSS column-widthはvertical-rl環境だと列がheight方向に伸びてしまい期待通り機能しない
	// ため使わない: headless Chromiumで実機検証済み)。width: max-contentで実際の内容量ぶんの
	// 幅を持たせ、親の.panelViewport(overflow:hidden)を窓としてtransform: translateXで
	// 動かしてページめくりを実現する。スクロールバーでの手動ドラッグはさせず、ページ送り
	// ボタン/スワイプ/矢印キー経由のみにする
	[data-mode="vertical"] > & {
		width: max-content;
	}
}

// JUICE: 章の先頭位置を覚えておくためだけの空要素(章ジャンプ時にgetBoundingClientRectで
// 位置を測る)。中身が無くても、縦書きでは行ボックスとしてフォントの高さぶんの領域を
// 確保してしまい、本文の先頭に隙間([#ここから2字下げ]等の直後で顕著)ができる原因に
// なっていた。display:inline-blockでサイズを明示的に0にして、位置測定の起点としての
// 役割だけ残しつつ見た目には一切影響しないようにする
.chapterMarker {
	display: inline-block;
	width: 0;
	height: 0;
	overflow: hidden;
}

.chapterNav {
	scroll-margin-top: var(--MI-stickyTop, 0px);
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 12px 0;
	opacity: 0.8;
	font-size: 0.9em;

	&:not(:first-child) {
		// JUICE: 背景テーマ(ライト/セピア/ダーク/カスタム)ごとの文字色に馴染むよう、文字色を薄めて使う
		border-top: 1px solid color-mix(in srgb, currentColor 25%, transparent);
	}
}

.chapterNavLink {
	padding: 4px 8px;

	&:disabled {
		opacity: 0.3;
	}
}

.chapterBreak {
	text-align: center;
	opacity: 0.5;
	margin: 1.5em 0;
}

.pager {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 16px;
	margin-top: 8px;
}

.pagerButton {
	padding: 8px;
	border-radius: 999px;

	&:disabled {
		opacity: 0.3;
	}
}

.pagerCount {
	opacity: 0.7;
	font-variant-numeric: tabular-nums;
}

.footerLink {
	display: block;
	opacity: 0.7;
}
</style>
