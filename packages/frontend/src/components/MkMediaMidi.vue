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
			<button class="_button" :class="$style.menu" :aria-label="i18n.ts.more" @click.stop="showMenu" @keydown.stop><i class="ti ti-dots" aria-hidden="true"></i></button>
			<button class="_button" :class="$style.menu" :aria-label="i18n.ts.hide" @click.stop="hide = true" @keydown.stop><i class="ti ti-eye-off" aria-hidden="true"></i></button>
		</div>

		<MkInfo v-if="tooLarge" warn>{{ i18n.tsx._juice.midiPlayerTooLarge({ size: bytes(midi.size ?? 0), limit: bytes(midiPlaybackMaxSize) }) }}</MkInfo>
		<template v-else>
			<canvas ref="visualizerEl" :class="$style.visualizer" width="900" height="72" aria-hidden="true"></canvas>

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
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkInfo from '@/components/MkInfo.vue';
import MkMediaRange from '@/components/MkMediaRange.vue';
import bytes from '@/filters/bytes.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import * as os from '@/os.js';
import { juicePublicSettingsCache } from '@/cache.js';
import { getFileMenu } from '@/utility/get-file-menu.js';
import { shouldHideFileByDefault, canRevealFile } from '@/utility/sensitive-file.js';
import { parseMidiFile } from '@/utility/juice-midi-parser.js';
import type { JuiceMidiVisualizerFrame } from '@/utility/juice-midi-player.js';
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
const NOTE_COUNT = 128;

// JUICE: 曲読み込み時に、元のMIDIファイルのトラック数ぶんだけランダムに生成する
// (index = JuiceMidiEvent.trackに対応)。黄金角ずつ色相をずらすことで、
// 隣接トラック同士の色が近くなりすぎないようにする
const GOLDEN_ANGLE_DEG = 137.508;
let trackColors: string[] = [];

function generateTrackColors(trackCount: number): string[] {
	const baseHue = Math.random() * 360;
	return Array.from({ length: trackCount }, (_, i) => `hsl(${(baseHue + i * GOLDEN_ANGLE_DEG) % 360}, 70%, 60%)`);
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

function drawVisualizer(frame: JuiceMidiVisualizerFrame) {
	const canvas = visualizerEl.value;
	if (canvas == null) return;
	if (visualizerCtx == null) visualizerCtx = canvas.getContext('2d');
	const ctx2d = visualizerCtx;
	if (ctx2d == null) return;

	const w = canvas.width;
	const h = canvas.height;
	ctx2d.clearRect(0, 0, w, h);

	const whiteKeyWidth = w / TOTAL_WHITE_KEYS;
	const blackKeyWidth = whiteKeyWidth * 0.6;
	const blackKeyHeight = h * 0.62;
	const { levels, tracks } = frame;

	// 白鍵→黒鍵の順で2パス描画する(実物の鍵盤と同じく黒鍵が白鍵の上に重なる見た目にするため)
	for (const drawBlack of [false, true]) {
		for (let note = 0; note < NOTE_COUNT; note++) {
			const layout = KEYBOARD_LAYOUT[note];
			if (layout.isBlack !== drawBlack) continue;

			const x = layout.xUnits * whiteKeyWidth;
			const width = layout.isBlack ? blackKeyWidth : whiteKeyWidth;
			const height = layout.isBlack ? blackKeyHeight : h;

			ctx2d.fillStyle = layout.isBlack ? '#1a1a1a' : '#fff';
			ctx2d.fillRect(x, 0, width, height);
			ctx2d.strokeStyle = layout.isBlack ? '#000' : '#bbb';
			ctx2d.lineWidth = 1;
			ctx2d.strokeRect(x + 0.5, 0.5, Math.max(0, width - 1), height - 1);

			// JUICE: 発音中の鍵盤だけ、トラック色を音量(0-1)そのままの不透明度(=うすさ)で重ねる
			const level = levels[note];
			if (level > 0) {
				ctx2d.globalAlpha = Math.min(1, level);
				ctx2d.fillStyle = trackColors[tracks[note]] ?? 'currentColor';
				ctx2d.fillRect(x, 0, width, height);
				ctx2d.globalAlpha = 1;
			}
		}
	}
}

// JUICE: ファイルの取得・解析が終わる(=再生ボタンを押す)前は真っ白のcanvasのままになって
// しまうため、何も発音していない状態の鍵盤だけ先に描いておく
function drawIdleKeyboard() {
	drawVisualizer({ levels: new Float32Array(NOTE_COUNT), tracks: new Int16Array(NOTE_COUNT).fill(-1) });
}

onMounted(() => {
	if (!hide.value) drawIdleKeyboard();
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
			trackColors = generateTrackColors(song.trackCount);
			midiPlayer = await JuiceMidiPlayer.create(audioContext, song, volume.value, (t, frame, noteCount, currentBpm) => {
				currentTime.value = t;
				drawVisualizer(frame);
				playedNoteCount.value = noteCount;
				bpm.value = currentBpm;
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
			});
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

onUnmounted(() => {
	midiPlayer?.dispose();
	midiPlayer = null;
	if (ownsMediaSession) {
		clearMediaSessionActionHandlers();
		if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
	}
});

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
	height: 56px;
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
