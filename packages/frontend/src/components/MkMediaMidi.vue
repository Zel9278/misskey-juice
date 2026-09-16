<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" @contextmenu.stop="onContextmenu">
	<button v-if="hide" :class="$style.hidden" @click="reveal">
		<div :class="$style.hiddenTextWrapper">
			<b v-if="midi.isSensitive" style="display: block;"><i class="ti ti-eye-exclamation"></i> {{ i18n.ts.sensitive }}{{ prefer.s.dataSaver.media && midi.size ? ` (MIDI ${bytes(midi.size)})` : '' }}</b>
			<b v-else style="display: block;"><span :class="$style.midiIconWrapper"><i class="ti ti-piano"></i><img src="/client-assets/juice-glass.svg" alt="" :class="$style.midiIconBadge"/></span> {{ prefer.s.dataSaver.media && midi.size ? bytes(midi.size) : 'MIDI' }}</b>
			<span style="display: block;">{{ i18n.ts.clickToShow }}</span>
		</div>
	</button>
	<div v-else :class="$style.player">
		<div :class="$style.info">
			<span :class="$style.infoIconWrapper">
				<i class="ti ti-piano" :class="$style.infoIcon"></i>
				<img src="/client-assets/juice-glass.svg" alt="" :class="$style.infoIconBadge"/>
			</span>
			<span :class="$style.filename">{{ midi.name }}</span>
			<button class="_button" :class="$style.menu" :aria-label="i18n.ts.settings" @click.stop="showSettingsMenu" @keydown.stop><i class="ti ti-settings" aria-hidden="true"></i></button>
			<button class="_button" :class="$style.menu" :aria-label="i18n.ts.more" @click.stop="showMenu" @keydown.stop><i class="ti ti-dots" aria-hidden="true"></i></button>
			<button class="_button" :class="$style.menu" :aria-label="i18n.ts._juice.midiPlayerFullscreen" @click.stop="onExpandClick" @keydown.stop><i class="ti ti-maximize" aria-hidden="true"></i></button>
			<button class="_button" :class="$style.menu" :aria-label="i18n.ts.hide" @click.stop="hide = true" @keydown.stop><i class="ti ti-eye-off" aria-hidden="true"></i></button>
		</div>

		<MkInfo v-if="tooLarge" warn>{{ i18n.tsx._juice.midiPlayerTooLarge({ size: bytes(midi.size ?? 0), limit: bytes(midiPlaybackMaxSize) }) }}</MkInfo>
		<template v-else>
			<MkInfo v-if="isIosFamily" warn>{{ i18n.ts._juice.midiPlayerIosSilentModeWarning }}</MkInfo>
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
						<span v-if="loading === 'loading' && loadProgress != null" :class="$style.time">{{ Math.round(loadProgress * 100) }}%</span>
						<span v-else :class="$style.time">{{ formatMidiTime(currentTime) }} / {{ formatMidiTime(duration) }}</span>
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
import { nextTick, onDeactivated, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkInfo from '@/components/MkInfo.vue';
import MkMediaRange from '@/components/MkMediaRange.vue';
import bytes from '@/filters/bytes.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import * as os from '@/os.js';
import { getFileMenu } from '@/utility/get-file-menu.js';
import { shouldHideFileByDefault, canRevealFile } from '@/utility/sensitive-file.js';
import { isIosFamily } from '@/utility/device-kind.js';
import { useJuiceMidiPlayer, bindMidiVisualizerCanvas, formatMidiTime } from '@/composables/use-juice-midi-player.js';

const props = defineProps<{
	midi: Misskey.entities.DriveFile;
}>();

const emit = defineEmits<{
	(event: 'mediaClick', ev: PointerEvent): void;
}>();

// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const hide = ref(shouldHideFileByDefault(props.midi));

async function reveal() {
	if (!(await canRevealFile(props.midi))) return;
	hide.value = false;
	// JUICE: v-elseで今まさにcanvasがDOMへ入るところなので、鍵盤の初期状態描画は1tick待つ
	nextTick(() => drawIdleKeyboard());
}

// JUICE: 拡大表示(ライトボックス)を開いたとき、このオブジェクトをそのまま受け渡して
// 同じ再生状態(再生中か・再生位置・音量等)を共有するため、composableの戻り値自体も
// 変数として保持しておく(defineExposeで公開する)
const midiPlayerState = useJuiceMidiPlayer(props.midi, () => hide.value);
// JUICE: このコンポーネント自身のcanvas要素(テンプレートの`ref="visualizerEl"`)を、
// ピアノロールの描画先として登録する
bindMidiVisualizerCanvas(midiPlayerState);
const {
	midiPlaybackMaxSize,
	tooLarge,
	loading,
	loadProgress,
	isPlaying,
	currentTime,
	duration,
	playedNoteCount,
	totalNoteCount,
	bpm,
	activeNoteCount,
	volume,
	toggleMute,
	seekPosition,
	onSeekEnded,
	drawIdleKeyboard,
	togglePlayPause,
	pause,
	buildMidiSettingsMenuItems,
} = midiPlayerState;

defineExpose({
	midiPlayer: midiPlayerState,
});

function showSettingsMenu(ev: PointerEvent) {
	os.popupMenu(buildMidiSettingsMenuItems(), (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined);
}

// JUICE: 画像/動画と同じく、拡大表示はライトボックス(MkLightbox.vue)を開く形に統一する
// (親のMkMediaList.vueがmediaClickを受けてopenGallery()を呼ぶ)
function onExpandClick(ev: PointerEvent) {
	emit('mediaClick', ev);
}

// JUICE: RouterView.vueがページを<KeepAlive>でキャッシュしているため、ノート詳細ページ等から
// 他ページへ遷移してもこのコンポーネントはアンマウントされず、裏で再生され続けてしまう。
// ページが非アクティブ化されるタイミングで明示的に一時停止する
onDeactivated(() => {
	pause();
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

// JUICE: 「これはJUICE独自のMIDIプレイヤーである」ことを示す小さいバッジ(タブ・投稿フォームの
// AI生成トグルと同じジュースグラスアイコンを流用)。ピアノアイコン自体に重ねる
.midiIconWrapper {
	position: relative;
	display: inline-block;
}

.midiIconBadge {
	position: absolute;
	bottom: -3px;
	right: -5px;
	width: 8px;
	height: 8px;
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

.infoIconWrapper {
	position: relative;
	display: inline-flex;
	flex-shrink: 0;
}

.infoIcon {
	opacity: 0.7;
}

.infoIconBadge {
	position: absolute;
	bottom: -3px;
	right: -5px;
	width: 9px;
	height: 9px;
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
