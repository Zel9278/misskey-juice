<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" @contextmenu.stop="onContextmenu">
	<button v-if="hide" :class="$style.hidden" @click="reveal">
		<div :class="$style.hiddenTextWrapper">
			<b v-if="midi.isSensitive" style="display: block;"><i class="ti ti-eye-exclamation"></i> {{ i18n.ts.sensitive }}{{ prefer.s.dataSaver.media && midi.size ? ` (MIDI ${bytes(midi.size)})` : '' }}</b>
			<b v-else style="display: block;"><i class="ti ti-piano"></i> {{ prefer.s.dataSaver.media && midi.size ? bytes(midi.size) : 'MIDI' }}</b>
			<span style="display: block;">{{ i18n.ts.clickToShow }}</span>
		</div>
	</button>
	<div v-else :class="$style.player">
		<div :class="$style.info">
			<i class="ti ti-piano" :class="$style.infoIcon"></i>
			<span :class="$style.filename">{{ midi.name }}</span>
			<button class="_button" :class="$style.menu" :aria-label="i18n.ts.settings" @click.stop="showSettingsMenu" @keydown.stop><i class="ti ti-settings" aria-hidden="true"></i></button>
			<button class="_button" :class="$style.menu" :aria-label="i18n.ts.more" @click.stop="showMenu" @keydown.stop><i class="ti ti-dots" aria-hidden="true"></i></button>
			<button class="_button" :class="$style.menu" :aria-label="i18n.ts.hide" @click.stop="hide = true" @keydown.stop><i class="ti ti-eye-off" aria-hidden="true"></i></button>
		</div>

		<MkInfo v-if="tooLarge" warn>{{ i18n.tsx._juice.midiPlayerTooLarge({ size: bytes(midi.size ?? 0), limit: bytes(midiPlaybackMaxSize) }) }}</MkInfo>
		<template v-else>
			<canvas v-if="prefer.r.midiVisualizerEnabled.value" ref="visualizerEl" :class="$style.visualizer" width="900" height="432" aria-hidden="true"></canvas>

			<div :class="$style.controls">
				<button
					class="_button"
					:class="$style.playButton"
					:disabled="loading === 'loading'"
					:aria-label="isPlaying ? i18n.ts.pause : i18n.ts.play"
					@click="togglePlayPause"
					@keydown.stop
				>
					<MkLoading v-if="loading === 'loading'" :em="true"/>
					<i v-else-if="isPlaying" class="ti ti-player-pause" aria-hidden="true"></i>
					<i v-else class="ti ti-player-play" aria-hidden="true"></i>
				</button>
				<div :class="$style.progressWrapper">
					<MkMediaRange v-model="seekPosition" @dragEnded="onSeekEnded"/>
					<div :class="$style.meta">
						<span :class="$style.time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
						<span :class="$style.stats">
							<span :class="$style.statItem"><i class="ti ti-metronome"></i> {{ totalNoteCount > 0 ? Math.round(bpm) : '–' }}</span>
							<span :class="$style.statItem"><i class="ti ti-stack-2"></i> {{ totalNoteCount > 0 ? activeNoteCount : '–' }}</span>
							<span :class="$style.statItem"><i class="ti ti-music"></i> {{ totalNoteCount > 0 ? `${playedNoteCount} / ${totalNoteCount}` : '–' }}</span>
						</span>
					</div>
				</div>
			</div>

			<div :class="$style.volumeRow">
				<button class="_button" :class="$style.volumeButton" :aria-label="i18n.ts.volume" @click="toggleMute" @keydown.stop>
					<i v-if="volume === 0" class="ti ti-volume-3" aria-hidden="true"></i>
					<i v-else class="ti ti-volume" aria-hidden="true"></i>
				</button>
				<MkMediaRange v-model="volume" :class="$style.volumeSlider"/>
			</div>

			<MkInfo v-if="loading === 'error'" warn>{{ i18n.ts._juice.midiPlayerParseError }}</MkInfo>
		</template>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onDeactivated, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkInfo from '@/components/MkInfo.vue';
import MkMediaRange from '@/components/MkMediaRange.vue';
import MkRange from '@/components/MkRange.vue';
import bytes from '@/filters/bytes.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import * as os from '@/os.js';
import { juicePublicSettingsCache } from '@/cache.js';
import { getFileMenu } from '@/utility/get-file-menu.js';
import { shouldHideFileByDefault, canRevealFile } from '@/utility/sensitive-file.js';
import { parseMidiFile, secondsToTicks } from '@/utility/juice-midi-parser.js';
import type { JuiceMidiNoteSpan, JuiceMidiSong } from '@/utility/juice-midi-parser.js';
import type { JuiceMidiVisualizerFrame } from '@/utility/juice-midi-player.js';
import type { MenuItem } from '@/types/menu.js';
import { JuiceMidiPlayer } from '@/utility/juice-midi-player.js';

// JUICE: 黒MIDI等、ノートイベント数が極端に多いファイルを解析・再生してブラウザが
// 固まることを防ぐための安全装置。admin設定(JuiceSettingsValue.midiPlayerMaxSize)で
// 変更可能なため、取得できるまでのフォールバックとしてサーバー側と同じ既定値を使う
const midiPlaybackMaxSize = ref(500 * 1024);
juicePublicSettingsCache.fetch().then(res => {
	midiPlaybackMaxSize.value = res.midiPlayerMaxSize;
}).catch(() => {});

const props = defineProps<{
	midi: Misskey.entities.DriveFile;
}>();

// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const hide = ref(shouldHideFileByDefault(props.midi));

async function reveal() {
	if (!(await canRevealFile(props.midi))) return;
	hide.value = false;
	// JUICE: v-elseで今まさにcanvasがDOMへ入るところなので、鍵盤の初期状態描画は1tick待つ
	nextTick(() => drawIdleKeyboard());
}

const tooLarge = computed(() => (props.midi.size ?? 0) > midiPlaybackMaxSize.value);

const loading = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const playedNoteCount = ref(0);
const totalNoteCount = ref(0);
const bpm = ref(0);
const activeNoteCount = ref(0);

let midiPlayer: JuiceMidiPlayer | null = null;

// JUICE: 音量はライトボックス・メディアタイムラインのインライン再生全体で共有する(prefer参照)
const volume = computed<number>({
	get: () => prefer.r.mediaVolume.value,
	set: (v) => prefer.commit('mediaVolume', v),
});

watch(volume, (v) => {
	midiPlayer?.setVolume(v);
});

function toggleMute() {
	volume.value = volume.value === 0 ? .25 : 0;
}

// JUICE: プレイヤーのメニュー("設定"アイコン)から、ビジュアライザーの有効/無効・
// ロールの速さ・同時発音数上限を直接切り替えられるようにする。設定画面(/settings/juice)の
// 同じ設定項目とそのまま同期する(prefer.model()経由なので、どちらから変更しても反映される)
const midiVisualizerEnabledPref = prefer.model('midiVisualizerEnabled');
const midiRollWindowSecondsPref = prefer.model('midiRollWindowSeconds');
const midiMaxPolyphonyPref = prefer.model('midiMaxPolyphony');

// JUICE: シークバーをドラッグ中は再生位置(50ms毎に更新される)に引っ張られないよう、
// ドラッグ中だけ別の値(dragPosition)を見せる
const isSeeking = ref(false);
const dragPosition = ref(0);
const seekPosition = computed<number>({
	get: () => isSeeking.value ? dragPosition.value : (duration.value > 0 ? currentTime.value / duration.value : 0),
	set: (v) => {
		isSeeking.value = true;
		dragPosition.value = v;
	},
});

function onSeekEnded(value: number) {
	isSeeking.value = false;
	const target = value * duration.value;
	currentTime.value = target;
	midiPlayer?.seek(target);
}

function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds)) return '0:00';
	const s = Math.max(0, Math.floor(seconds));
	const m = Math.floor(s / 60);
	const ss = (s % 60).toString().padStart(2, '0');
	return `${m}:${ss}`;
}

// JUICE: 128鍵ぶんの鍵盤をcanvasへ直接描画するビジュアライザー。Vueの再描画を介さないことで
// 再生中(50ms毎)の更新コストを抑える
const visualizerEl = useTemplateRef<HTMLCanvasElement>('visualizerEl');
let visualizerCtx: CanvasRenderingContext2D | null = null;
// JUICE: v-ifでビジュアライザーの表示/非表示を切り替えると、再表示時にcanvas要素そのものが
// 作り直される(=古いvisualizerCtxは無効な参照のまま)。どのcanvas由来のcontextかを覚えておき、
// 要素が変わっていたら取り直す(でないと無効化→再有効化で描画が復活しなくなる)
let visualizerCtxOwner: HTMLCanvasElement | null = null;
const NOTE_COUNT = 128;

// JUICE: 曲読み込み時に、元のMIDIファイルのトラック数ぶんだけランダムに生成する
// (index = JuiceMidiEvent.trackに対応)。黄金角ずつ色相をずらすことで、
// 隣接トラック同士の色が近くなりすぎないようにする
const GOLDEN_ANGLE_DEG = 137.508;
let trackColors: string[] = [];
// JUICE: ピアノロールのノート枠取り用の暗い版(trackColorsと同じ色相、輝度だけ落としたもの)
let trackColorsDark: string[] = [];

// JUICE: ピアノロール(上段、ノートが鍵盤へ向けて降ってくる表示)まわりの実装は、
// せどの既存ツール(avu2-midi-info、AviUtl用MIDIピアノロール描画プラグイン)の
// src/core/MidiPianoRoll_render.cpp を移植したもの。窓の合計秒数(ROLL_WINDOW_SECONDS)・
// 「今」の位置(ROLL_PLAYHEAD_RATIO、上端=0〜下端=1)・ノート番号ごとの二分探索+
// 打ち切りスキャン(forVisibleSpans)・同一ノート番号内でのオクルージョン(隠れて
// 見えないノートは描かない)・縁取りは、いずれも同ツールの既定値/アルゴリズムをそのまま踏襲する
const ROLL_HEIGHT = 360;
const KEY_HEIGHT = 72;
// JUICE: スクロール軸はavu2-midi-infoの「Beat (musical)」時間軸モード(quarter_beats_at/
// seconds_at_beat)と同じ発想で、実秒ではなくMIDIの生tick(テンポに依存しない軸)で計算する。
// テンポが変化する曲でも、リズム上の間隔(何tick離れているか)がそのまま画面上の距離になる。
// 「何秒ぶんを一画面に収めるか」はprefer.r.midiRollWindowSeconds(設定で変更可能)。
// 曲頭のテンポで換算したときの目安の秒数で、実際のスクロール速度はtick基準で固定するため、
// テンポが変わると実際に見える秒数は前後する
// JUICE: 「今」がロール内のどの高さにあるか(0=上端に固定=全域が過去、1=下端に固定=全域が未来)。
// 1.0にして、鍵盤(下段)との境界にちょうど「今」の線がくっつくようにしている
const ROLL_PLAYHEAD_RATIO = 1.0;
const ROLL_NOW_Y = ROLL_PLAYHEAD_RATIO * ROLL_HEIGHT;
// JUICE: 黒MIDI等、瞬間的なノート密度が極端に高い曲でも1フレームの描画コストに上限を設ける
// (音が消える問題と同根で、ここも無制限に回すとメインスレッドが詰まりかねないため)
const MAX_ROLL_NOTES_PER_FRAME = 50000;

let notesByPitch: JuiceMidiNoteSpan[][] = [];
let notesMaxEndByPitch: number[][] = [];
let loadedSong: JuiceMidiSong | null = null;
// JUICE: オクルージョン判定用のピクセル被覆バッファ。ノート番号ごとに使い回す(fillでクリア)
const rollCoverageBuffer = new Uint8Array(ROLL_HEIGHT);

// JUICE: prefer.r.midiRollWindowSeconds(曲頭のテンポでの目安秒数、設定で変更可能)から、
// tick単位でのスクロール速度を求める。設定変更を再生中にも反映できるよう毎回計算し直す
// (割り算1回程度なので、60fpsで呼んでもコストは無視できる)。prefer.s(非リアクティブな
// 生スナップショット)ではなくprefer.rを使うのは、他の呼び出し元(watch等)と統一するため
function getRollPixelsPerTick(song: JuiceMidiSong): number {
	const ticksPerSecondAtStart = song.ticksPerQuarter * (song.initialBpm / 60);
	return ROLL_HEIGHT / (prefer.r.midiRollWindowSeconds.value * ticksPerSecondAtStart);
}

// JUICE: MidiPianoRoll_render.cppのfor_visible_spansの移植。notesByPitch[pitch]は
// tick昇順なので、まずtickMax以下の最後の開始位置を二分探索で求め、そこから過去方向(添字を
// 減らす方向)へ走査する。「その位置までの終了tickの累積最大値」(notesMaxEndByPitch)が
// tickMinを下回った時点で、それより前は全て可視ウィンドウの外と確定するため打ち切れる。
// 呼び出し元へは新しい(=tickMaxに近い)ノートから順に渡す
function forVisibleSpans(pitch: number, tickMin: number, tickMax: number, fn: (note: JuiceMidiNoteSpan) => void): void {
	const spans = notesByPitch[pitch];
	if (spans == null || spans.length === 0) return;
	const maxEnd = notesMaxEndByPitch[pitch];
	let lo = 0;
	let hi = spans.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (spans[mid].tick <= tickMax) lo = mid + 1;
		else hi = mid;
	}
	for (let i = lo - 1; i >= 0; i--) {
		if (maxEnd[i] < tickMin) break;
		if (spans[i].tick + spans[i].tickDuration < tickMin) continue;
		fn(spans[i]);
	}
}

function generateTrackColors(trackCount: number): { light: string[]; dark: string[] } {
	const baseHue = Math.random() * 360;
	const hues = Array.from({ length: trackCount }, (_, i) => (baseHue + i * GOLDEN_ANGLE_DEG) % 360);
	return {
		light: hues.map(hue => `hsl(${hue}, 70%, 60%)`),
		dark: hues.map(hue => `hsl(${hue}, 70%, 30%)`),
	};
}

// JUICE: MIDIノート番号(0-127)を鍵盤上のx座標(白鍵1つ分を1単位とする)に変換するための
// オクターブ内(0-11)レイアウト。黒鍵のオフセットは実物の鍵盤の2+3グループ配置に近似させている
const PITCH_CLASS_LAYOUT: { isBlack: boolean; offset: number }[] = [
	{ isBlack: false, offset: 0 }, // C
	{ isBlack: true, offset: 0.7 }, // C#
	{ isBlack: false, offset: 1 }, // D
	{ isBlack: true, offset: 1.7 }, // D#
	{ isBlack: false, offset: 2 }, // E
	{ isBlack: false, offset: 3 }, // F
	{ isBlack: true, offset: 3.6 }, // F#
	{ isBlack: false, offset: 4 }, // G
	{ isBlack: true, offset: 4.6 }, // G#
	{ isBlack: false, offset: 5 }, // A
	{ isBlack: true, offset: 5.6 }, // A#
	{ isBlack: false, offset: 6 }, // B
];

type KeyLayout = { isBlack: boolean; xUnits: number };

function buildKeyboardLayout(): { keys: KeyLayout[]; totalWhiteKeys: number } {
	const keys: KeyLayout[] = [];
	let totalWhiteKeys = 0;
	for (let note = 0; note < NOTE_COUNT; note++) {
		const octave = Math.floor(note / 12);
		const pc = PITCH_CLASS_LAYOUT[note % 12];
		keys.push({ isBlack: pc.isBlack, xUnits: octave * 7 + pc.offset });
		if (!pc.isBlack) totalWhiteKeys++;
	}
	return { keys, totalWhiteKeys };
}

const { keys: KEYBOARD_LAYOUT, totalWhiteKeys: TOTAL_WHITE_KEYS } = buildKeyboardLayout();

function drawVisualizer(frame: JuiceMidiVisualizerFrame, currentTimeSec = 0) {
	const canvas = visualizerEl.value;
	if (canvas == null) return;
	if (visualizerCtx == null || visualizerCtxOwner !== canvas) {
		visualizerCtx = canvas.getContext('2d');
		visualizerCtxOwner = canvas;
	}
	const ctx2d = visualizerCtx;
	if (ctx2d == null) return;

	const w = canvas.width;
	ctx2d.clearRect(0, 0, w, canvas.height);

	const whiteKeyWidth = w / TOTAL_WHITE_KEYS;
	const blackKeyWidth = whiteKeyWidth * 0.6;

	// JUICE: ピアノロール(上段)。テンポに依存しないtick軸で、ROLL_PLAYHEAD_RATIOの高さに
	// 「今」を置いて表示する(1.0=下端固定=鍵盤との境界)。ノート番号ごとに二分探索+
	// 打ち切りスキャンで可視ノートだけ拾い、同じ鍵の列で他のノートに完全に隠れているものは
	// 描かない(オクルージョン)。アルゴリズムはavu2-midi-infoの移植
	if (notesByPitch.length > 0 && loadedSong != null) {
		const nowTick = secondsToTicks(loadedSong, currentTimeSec);
		const rollPixelsPerTick = getRollPixelsPerTick(loadedSong);
		// JUICE: y=0(上端)がtickMax、y=ROLL_HEIGHT(下端)がtickMin に対応する
		// (avu2-midi-infoのt_max = now + playhead_y/pps、t_min = now + (playhead_y-h)/pps と同じ式)
		const tickMax = nowTick + ROLL_NOW_Y / rollPixelsPerTick;
		const tickMin = nowTick - (ROLL_HEIGHT - ROLL_NOW_Y) / rollPixelsPerTick;

		ctx2d.save();
		ctx2d.beginPath();
		ctx2d.rect(0, 0, w, ROLL_HEIGHT);
		ctx2d.clip();
		ctx2d.globalAlpha = 1; // JUICE: ロールの不透明度は固定(1.0)で統一している

		let drawnCount = 0;
		for (const drawBlack of [false, true]) { // 白鍵→黒鍵の順(鍵盤側と同じレイヤー順)
			for (let pitch = 0; pitch < NOTE_COUNT && drawnCount < MAX_ROLL_NOTES_PER_FRAME; pitch++) {
				const layout = KEYBOARD_LAYOUT[pitch];
				if (layout.isBlack !== drawBlack) continue;

				// vis: 新しい(tickMaxに近い)ノートから順。ya/yb: 各ノートの描画区間(ピクセル、Y昇順に正規化)
				const vis: JuiceMidiNoteSpan[] = [];
				forVisibleSpans(pitch, tickMin, tickMax, note => vis.push(note));
				if (vis.length === 0) continue;

				const ya: number[] = new Array(vis.length);
				const yb: number[] = new Array(vis.length);
				const visible: boolean[] = new Array(vis.length);
				rollCoverageBuffer.fill(0);

				// front-to-back(新しい→古い)で被覆を取り、見えるノートを判定する
				for (let i = 0; i < vis.length; i++) {
					const note = vis[i];
					const yBottom = ROLL_NOW_Y - (note.tick - nowTick) * rollPixelsPerTick;
					const yTop = ROLL_NOW_Y - (note.tick + note.tickDuration - nowTick) * rollPixelsPerTick;
					const a = Math.max(0, Math.round(yTop));
					let b = Math.round(yBottom) - 1;
					if (b < a) b = a;
					ya[i] = a;
					yb[i] = b;
					const cy0 = Math.max(0, a);
					const cy1 = Math.min(ROLL_HEIGHT - 1, b);
					let anyVisible = false;
					for (let y = cy0; y <= cy1; y++) {
						if (rollCoverageBuffer[y] === 0) {
							anyVisible = true;
							rollCoverageBuffer[y] = 1;
						}
					}
					visible[i] = anyVisible;
				}

				const x = layout.xUnits * whiteKeyWidth;
				const barWidth = Math.max(1, (layout.isBlack ? blackKeyWidth : whiteKeyWidth) - 1);

				// back-to-front(古い→新しい)で見えるノートだけ描画する
				for (let k = vis.length - 1; k >= 0; k--) {
					if (!visible[k]) continue;
					if (drawnCount >= MAX_ROLL_NOTES_PER_FRAME) break;

					const note = vis[k];
					const top = ya[k];
					const height = Math.max(1, yb[k] - ya[k] + 1);

					// JUICE: 縁取り。暗い色を少し大きく塗ってから内側に明るい色を重ねるだけ
					// (strokeRectより軽い)。密集した曲でも隣接ノート同士がにじまず、
					// 1つ1つの輪郭がはっきり見えるようにする
					if (barWidth >= 3 && height >= 3) {
						ctx2d.fillStyle = trackColorsDark[note.track] ?? 'currentColor';
						ctx2d.fillRect(x, top, barWidth, height);
						ctx2d.fillStyle = trackColors[note.track] ?? 'currentColor';
						ctx2d.fillRect(x + 1, top + 1, barWidth - 2, height - 2);
					} else {
						ctx2d.fillStyle = trackColors[note.track] ?? 'currentColor';
						ctx2d.fillRect(x, top, barWidth, height);
					}

					drawnCount++;
				}
			}
		}

		ctx2d.globalAlpha = 1;
		ctx2d.restore();

		// JUICE: 「今」の位置を示す横線(avu2-midi-infoのplayhead線を踏襲)。ROLL_PLAYHEAD_RATIO=1.0
		// だとロールのクリップ範囲ぎりぎり外側になるため、クリップの外(=鍵盤との境界)で描く
		ctx2d.fillStyle = 'rgba(255, 56, 76, 0.85)';
		ctx2d.fillRect(0, Math.min(ROLL_HEIGHT - 1, Math.round(ROLL_NOW_Y)), w, 1);
	}

	// JUICE: 鍵盤(下段)。現在鳴っている音をハイライトする、以前からの表示
	const blackKeyHeight = KEY_HEIGHT * 0.62;
	const { levels, tracks } = frame;

	// 白鍵→黒鍵の順で2パス描画する(実物の鍵盤と同じく黒鍵が白鍵の上に重なる見た目にするため)
	for (const drawBlack of [false, true]) {
		for (let note = 0; note < NOTE_COUNT; note++) {
			const layout = KEYBOARD_LAYOUT[note];
			if (layout.isBlack !== drawBlack) continue;

			const x = layout.xUnits * whiteKeyWidth;
			const width = layout.isBlack ? blackKeyWidth : whiteKeyWidth;
			const height = layout.isBlack ? blackKeyHeight : KEY_HEIGHT;

			ctx2d.fillStyle = layout.isBlack ? '#1a1a1a' : '#fff';
			ctx2d.fillRect(x, ROLL_HEIGHT, width, height);
			ctx2d.strokeStyle = layout.isBlack ? '#000' : '#bbb';
			ctx2d.lineWidth = 1;
			ctx2d.strokeRect(x + 0.5, ROLL_HEIGHT + 0.5, Math.max(0, width - 1), height - 1);

			// JUICE: 発音中の鍵盤だけ、ロールのノートと同じ縁取りスタイル(不透明度は固定1.0)で
			// トラック色を重ねる。離鍵時のフェードアウトは行わず、即座に消灯する
			const level = levels[note];
			if (level > 0) {
				const track = tracks[note];
				if (width >= 3 && height >= 3) {
					ctx2d.fillStyle = trackColorsDark[track] ?? 'currentColor';
					ctx2d.fillRect(x, ROLL_HEIGHT, width, height);
					ctx2d.fillStyle = trackColors[track] ?? 'currentColor';
					ctx2d.fillRect(x + 1, ROLL_HEIGHT + 1, width - 2, height - 2);
				} else {
					ctx2d.fillStyle = trackColors[track] ?? 'currentColor';
					ctx2d.fillRect(x, ROLL_HEIGHT, width, height);
				}
			}
		}
	}
}

// JUICE: ファイルの取得・解析が終わる(=再生ボタンを押す)前は真っ白のcanvasのままになって
// しまうため、何も発音していない状態の鍵盤だけ先に描いておく
function drawIdleKeyboard() {
	drawVisualizer({ levels: new Float32Array(NOTE_COUNT), tracks: new Int16Array(NOTE_COUNT).fill(-1) });
}

// JUICE: ピアノロールをrequestAnimationFrameで滑らかに動かすためのループ。プレイヤー本体の
// スケジューラ(50ms周期)に同期した描画だけだと、ロールの落下が20fps相当でカクついて見える
// (数値上の速度を上げても体感速度は改善しない)ため、再生中だけ別途rAFで毎フレーム
// 位置を補間して描き直す。「今どのノートが鳴っているか」(lastFrame)自体は引き続き
// スケジューラ側の更新頻度のままで良い(離散的な状態なので60fpsで動かす意味が薄い)
let lastFrame: JuiceMidiVisualizerFrame = { levels: new Float32Array(NOTE_COUNT), tracks: new Int16Array(NOTE_COUNT).fill(-1) };
let renderLoopId: number | null = null;

function renderLoopStep() {
	if (midiPlayer != null && isPlaying.value) {
		drawVisualizer(lastFrame, midiPlayer.getCurrentTime());
	}
	renderLoopId = window.requestAnimationFrame(renderLoopStep);
}

function startRenderLoop() {
	if (renderLoopId != null) return;
	renderLoopId = window.requestAnimationFrame(renderLoopStep);
}

function stopRenderLoop() {
	if (renderLoopId != null) {
		window.cancelAnimationFrame(renderLoopId);
		renderLoopId = null;
	}
}

// JUICE: 再生中、かつビジュアライザーが有効なときだけrAFを回す(黒MIDI等の重い曲で
// 無効化中までrAFを空回りさせないようにする)。プレイヤーのメニューからも
// prefer.r.midiVisualizerEnabledを再生中に切り替えられるため、isPlayingだけでなく
// こちらの変化でも起動/停止し直す
// JUICE: ここと以降のwatch()は、prefer.s(非リアクティブな生スナップショット)ではなく
// 必ずprefer.r(Vueのref)を使うこと。prefer.sはVueのリアクティビティ対象外のプレーンな
// オブジェクトのため、prefer.commit()で値自体は正しく更新されても、prefer.sを読んでいる
// テンプレートのv-if・computed・watchはVue側が変化を検知できず反映されない
// (実機で確認済みの実際にあった不具合。drawVisualizer内のような、Vueの再描画を介さず
// 毎フレーム能動的に呼ばれる箇所に限っては、そのままprefer.sを読んでも実害が無い)
const shouldRunRollRenderLoop = computed(() => isPlaying.value && prefer.r.midiVisualizerEnabled.value);
watch(shouldRunRollRenderLoop, (should) => {
	if (should) startRenderLoop();
	else stopRenderLoop();
});

// JUICE: 無効化→再度有効化したときに、次のスケジューラtick/rAFを待たずすぐ絵が出るようにする
// (v-ifで作り直された直後のcanvasは真っ白なまま)
// JUICE: 再生中はrAFループが毎フレーム最新の設定値を読んで描き直すので自然に反映されるが、
// 一時停止中は誰も描き直さないため、設定を変えてもその場では古い見た目のまま止まってしまう。
// 変更があった時点で一度だけ強制的に描き直しておく
function forceRedrawVisualizer() {
	nextTick(() => {
		if (midiPlayer != null) {
			drawVisualizer(lastFrame, midiPlayer.getCurrentTime());
		} else if (!hide.value) {
			drawIdleKeyboard();
		}
	});
}

watch(prefer.r.midiVisualizerEnabled, (enabled) => {
	if (enabled) forceRedrawVisualizer();
});

watch(prefer.r.midiRollWindowSeconds, () => {
	if (prefer.r.midiVisualizerEnabled.value) forceRedrawVisualizer();
});

// JUICE: onMountedでの一度きりのdrawIdleKeyboard()呼び出しだけだと、tooLarge(非同期取得する
// midiPlaybackMaxSizeに依存)等の影響でcanvas要素が初回マウント後に作り直されるケースで、
// 新しいcanvasには何も描かれないまま(真っ白の透明)になってしまうことがあった。
// テンプレートref自体を監視し、canvasが実際にアタッチされる(=差し替わる)たびに描き直すことで、
// 何が原因で作り直されても必ず追従するようにする
watch(visualizerEl, (canvas) => {
	if (canvas == null || hide.value) return;
	if (midiPlayer != null) {
		drawVisualizer(lastFrame, midiPlayer.getCurrentTime());
	} else {
		drawIdleKeyboard();
	}
});

// JUICE: 生のWeb Audio APIで合成しているだけだとブラウザ/OSに「メディア再生中」として
// 認識されず、ロック画面・通知領域のメディアコントロールやハードウェアの再生キーが
// 効かないため、Media Session APIで明示的に音声/動画プレイヤーと同じ扱いにする。
// ページ内に複数のMIDIプレイヤーが同時に存在する場合、navigator.mediaSessionはページ全体で
// 単一のため後勝ちになる(音声/動画側も含めてこのアプリ全体で調停の仕組みは無く、
// 他のブラウザ埋め込みメディアウィジェットでも一般的な制約として許容する)
let ownsMediaSession = false;

function updateMediaSessionMetadata() {
	if (!('mediaSession' in navigator)) return;
	navigator.mediaSession.metadata = new MediaMetadata({
		title: props.midi.name,
	});
}

function setupMediaSessionActionHandlers() {
	if (!('mediaSession' in navigator)) return;
	navigator.mediaSession.setActionHandler('play', () => {
		midiPlayer?.play().then(() => {
			isPlaying.value = true;
			navigator.mediaSession.playbackState = 'playing';
		});
	});
	navigator.mediaSession.setActionHandler('pause', () => {
		midiPlayer?.pause().then(() => {
			isPlaying.value = false;
			navigator.mediaSession.playbackState = 'paused';
		});
	});
	navigator.mediaSession.setActionHandler('seekbackward', (details) => {
		const target = Math.max(0, currentTime.value - (details.seekOffset ?? 10));
		currentTime.value = target;
		midiPlayer?.seek(target);
	});
	navigator.mediaSession.setActionHandler('seekforward', (details) => {
		const target = Math.min(duration.value, currentTime.value + (details.seekOffset ?? 10));
		currentTime.value = target;
		midiPlayer?.seek(target);
	});
	navigator.mediaSession.setActionHandler('seekto', (details) => {
		if (details.seekTime == null) return;
		currentTime.value = details.seekTime;
		midiPlayer?.seek(details.seekTime);
	});
}

function clearMediaSessionActionHandlers() {
	if (!('mediaSession' in navigator)) return;
	for (const action of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto'] as const) {
		navigator.mediaSession.setActionHandler(action, null);
	}
}

async function togglePlayPause() {
	if (tooLarge.value || loading.value === 'loading') return;

	if (midiPlayer == null) {
		// JUICE: クリックの直接応答としてAudioContextを生成する(自動再生ポリシー対策)。
		// ここではまだresumeしない: 生成直後は自然にsuspended状態(時計が進まない)なので、
		// この後のfetch・ノート登録(先読みスケジューラ、イベント数次第で時間がかかりうる)の間も
		// 予定時刻がズレない。resumeはJuiceMidiPlayer.play()内で、初回のみ呼ぶ
		const audioContext = new AudioContext();

		loading.value = 'loading';
		try {
			const buffer = await window.fetch(props.midi.url).then(res => res.arrayBuffer());
			const song = parseMidiFile(buffer);
			duration.value = song.durationSeconds;
			bpm.value = song.initialBpm;
			({ light: trackColors, dark: trackColorsDark } = generateTrackColors(song.trackCount));
			notesByPitch = song.notesByPitch;
			notesMaxEndByPitch = song.notesMaxEndByPitch;
			loadedSong = song;
			midiPlayer = await JuiceMidiPlayer.create(audioContext, song, buffer, volume.value, (t, frame, noteCount, currentBpm, activeCount) => {
				currentTime.value = t;
				lastFrame = frame;
				drawVisualizer(frame, t);
				playedNoteCount.value = noteCount;
				bpm.value = currentBpm;
				activeNoteCount.value = activeCount;
				if (ownsMediaSession && 'mediaSession' in navigator && duration.value > 0) {
					try {
						navigator.mediaSession.setPositionState({ duration: duration.value, playbackRate: 1, position: Math.min(t, duration.value) });
					} catch {
						// JUICE: シーク直後等、durationとpositionの整合が一瞬崩れて例外になることがあるため無視する
					}
				}
			}, () => {
				isPlaying.value = false;
				if (ownsMediaSession && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
			}, prefer.r.midiMaxPolyphony.value);
			totalNoteCount.value = midiPlayer.totalNoteCount;
			loading.value = 'ready';
		} catch (err) {
			if (_DEV_) console.warn('Failed to parse MIDI file:', err);
			audioContext.close().catch(() => {});
			loading.value = 'error';
			return;
		}
	}

	if (isPlaying.value) {
		await midiPlayer.pause();
		isPlaying.value = false;
		if (ownsMediaSession && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
	} else {
		await midiPlayer.play();
		isPlaying.value = true;
		ownsMediaSession = true;
		updateMediaSessionMetadata();
		setupMediaSessionActionHandlers();
		if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
	}
}

// JUICE: RouterView.vueがページを<KeepAlive>でキャッシュしているため、ノート詳細ページ等から
// 他ページへ遷移してもこのコンポーネントはアンマウントされず(onUnmountedが呼ばれず)、
// 裏で再生され続けてしまう。ページが非アクティブ化されるタイミングで明示的に一時停止する
// (dispose/AudioContextのcloseまではしない。onActivatedで戻ってきた時にすぐ続きを聞けるように)
onDeactivated(() => {
	if (isPlaying.value && midiPlayer != null) {
		midiPlayer.pause();
		isPlaying.value = false;
		if (ownsMediaSession && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
	}
});

onUnmounted(() => {
	stopRenderLoop();
	midiPlayer?.dispose();
	midiPlayer = null;
	if (ownsMediaSession) {
		clearMediaSessionActionHandlers();
		if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
	}
});

// JUICE: 同時発音数上限は設定画面ではスライダーで連続値を選べるが、プレイヤーのメニューでは
// XControlの再生速度メニュー(MkLightbox.item.controls.vue)と同じ"radio"項目でよく使いそうな
// 値だけをプリセットとして出す(細かい調整は設定画面から)。ロールの速さは、設定画面と同じ
// 細かいスライダーをそのままメニュー内に埋め込む(type: 'component')
const MAX_POLYPHONY_PRESETS = [32, 64, 128, 256, 384, 512, 640];

function showSettingsMenu(ev: PointerEvent) {
	const menu: MenuItem[] = [
		{
			type: 'switch',
			text: i18n.ts._juice.midiVisualizerEnabled,
			icon: 'ti ti-piano',
			ref: midiVisualizerEnabledPref,
		},
		{
			type: 'label',
			text: i18n.ts._juice.midiRollSpeed,
		},
		{
			// JUICE: item.propsはメニューを開いた瞬間に一度だけ評価されるプレーンオブジェクトで、
			// MkMenu.vueはtype:'component'をv-bind="item.props"でそのまま流し込むだけ(switch/radio
			// と違いunref()を通さない)。そのため、このdisabledをmidiVisualizerEnabledPref.value
			// にしても、同じメニューを開いたまま上のスイッチをトグルした際には追従しない
			// (再度メニューを開き直すまで古い値のまま)。実害は見た目上のグレーアウトが
			// 一瞬ズレるだけ(値の保存自体は常に正しく行われる)なので、あえてdisabledは付けない
			type: 'component',
			component: MkRange,
			props: {
				modelValue: midiRollWindowSecondsPref.value,
				min: 0.2,
				max: 3,
				step: 0.05,
				continuousUpdate: true,
				textConverter: (v: number) => `${v.toFixed(2)}s`,
				'onUpdate:modelValue': (v: number) => { midiRollWindowSecondsPref.value = v; },
			},
		},
		{
			// JUICE: 同時発音数はFluidSynthの初期化時にしか渡せないため、変更してもここで
			// 再生中の曲には反映されない(次に再生ボタンを押した時=次の曲/次回の再生から有効)
			type: 'radio',
			text: i18n.ts._juice.midiMaxPolyphony,
			icon: 'ti ti-stack-2',
			ref: midiMaxPolyphonyPref,
			options: MAX_POLYPHONY_PRESETS.map(value => ({ label: String(value), value })),
		},
	];
	os.popupMenu(menu, (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined);
}

function showMenu(ev: PointerEvent) {
	os.popupMenu(getFileMenu(props.midi, (newHide) => { hide.value = newHide; }), (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined);
}

function onContextmenu(ev: PointerEvent) {
	os.contextMenu(getFileMenu(props.midi, (newHide) => { hide.value = newHide; }), ev);
}
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
	border-radius: 8px;
	overflow: clip;
	background: var(--MI_THEME-panel);
}

.hidden {
	width: 100%;
	background: #000;
	border: none;
	outline: none;
	font: inherit;
	color: inherit;
	cursor: pointer;
	padding: 20px 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.hiddenTextWrapper {
	text-align: center;
	font-size: 0.8em;
	color: #fff;
}

.player {
	padding: 10px 12px;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.info {
	display: flex;
	align-items: center;
	gap: 6px;
}

.infoIcon {
	opacity: 0.7;
}

.filename {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.9em;
}

.menu {
	flex-shrink: 0;
	opacity: 0.7;
	padding: 4px;
}

.visualizer {
	width: 100%;
	height: auto;
	aspect-ratio: 900 / 432;
	color: var(--MI_THEME-accent);
}

.controls {
	display: flex;
	align-items: center;
	gap: 10px;
}

.playButton {
	flex-shrink: 0;
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	border-radius: 100%;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
}

.progressWrapper {
	flex: 1;
	min-width: 0;
}

.meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-top: 2px;
	font-size: 0.75em;
	opacity: 0.7;
}

.time {
	flex-shrink: 0;
}

.stats {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	overflow: hidden;
}

.statItem {
	display: flex;
	align-items: center;
	gap: 3px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.volumeRow {
	display: flex;
	align-items: center;
	gap: 6px;
}

.volumeButton {
	flex-shrink: 0;
	opacity: 0.7;
	width: 28px;
	height: 28px;
	display: grid;
	place-items: center;
}

.volumeSlider {
	width: 90px;
	flex-shrink: 0;
}
</style>
