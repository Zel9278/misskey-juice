<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	ref="playerEl"
	tabindex="0"
	:class="[
		$style.root,
		(video.isSensitive && prefer.s.highlightSensitiveMedia) && $style.sensitive,
	]"
	@contextmenu.stop="onContextmenu"
>
	<button v-if="hide" :class="$style.hidden" @click="reveal">
		<div :class="$style.hiddenTextWrapper">
			<b v-if="video.isSensitive" style="display: block;"><i class="ti ti-eye-exclamation"></i> {{ i18n.ts.sensitive }}{{ prefer.s.dataSaver.media ? ` (${i18n.ts.video}${video.size ? ' ' + bytes(video.size) : ''})` : '' }}</b>
			<b v-else style="display: block;"><i class="ti ti-movie"></i> {{ prefer.s.dataSaver.media && video.size ? bytes(video.size) : i18n.ts.video }}</b>
			<span style="display: block;">{{ i18n.ts.clickToShow }}</span>
		</div>
	</button>

	<div v-else :class="$style.videoRoot" @click="!inlinePlayable && emit('mediaClick', $event)">
		<!-- JUICE: メディアタイムラインでは拡大表示を経由せずその場で再生できるようにする。
		     ネイティブのcontrolsではなく、ライトボックス(MkLightbox.item.vue)と同じ自作の
		     コントロール(XControl)を再利用する。動画本体のタップ/ドラッグはカルーセルの
		     スワイプ判定にそのまま渡してよく、コントロールバー部分だけ伝播を止めればよい -->
		<template v-if="inlinePlayable">
			<video
				ref="inlineVideoEl"
				:class="$style.video"
				:poster="video.thumbnailUrl ?? undefined"
				playsinline
				preload="metadata"
				@click.stop="togglePlayPause"
				@dblclick="onDblClick"
			>
				<source :src="video.url">
			</video>
			<div v-if="!isMediaPlaying" :class="$style.playIconWrapper">
				<div :class="$style.playIcon">
					<i class="ti ti-player-play"></i>
				</div>
			</div>
			<div :class="$style.inlineControls" @pointerdown.stop @click.stop>
				<XControl ref="mediaControl" v-model:volume="volume" :expandAction="onDblClick"/>
			</div>
		</template>
		<template v-else>
			<img
				v-if="video.thumbnailUrl"
				:class="$style.video"
				:src="video.thumbnailUrl"
				:alt="video.comment ?? undefined"
			/>
			<video
				v-else
				:class="$style.video"
				:alt="video.comment"
				preload="metadata"
			>
				<source :src="video.url">
			</video>
			<div :class="$style.playIconWrapper">
				<div :class="$style.playIcon">
					<i class="ti ti-player-play"></i>
				</div>
			</div>
		</template>
		<!-- JUICE: インライン再生中は下端をコントロールバーが占有するため、ファイルメニューだけ
		     左上(通常はインジケータ等が無く空いている)へ逃がして被らないようにする -->
		<button :class="[$style.menu, inlinePlayable ? $style.menuTopLeft : $style.menuBottom]" class="_button" @click.stop="showMenu"><i class="ti ti-dots" style="vertical-align: middle;" aria-hidden="true"></i></button>
		<button :class="[$style.menu, $style.menuTop]" class="_button" @click.stop="hide = true"><i class="ti ti-eye-off" style="vertical-align: middle;" aria-hidden="true"></i></button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, computed, provide, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import type { MediaComponentExposes } from '@/types/media-component.js';
import bytes from '@/filters/bytes.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import * as os from '@/os.js';
import { DI } from '@/di.js';
import XControl from '@/components/MkLightbox.item.controls.vue';
import { getFileMenu } from '@/utility/get-file-menu.js';
import { shouldHideFileByDefault, canRevealFile } from '@/utility/sensitive-file.js';

const props = withDefaults(defineProps<{
	video: Misskey.entities.DriveFile;
	// JUICE: メディアタイムラインのカルーセル用。拡大しなくてもその場で再生できるようにする
	inlinePlayable?: boolean;
}>(), {
	inlinePlayable: false,
});

const emit = defineEmits<{
	(event: 'mediaClick', ev: PointerEvent): void;
}>();

// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const hide = ref(shouldHideFileByDefault(props.video));

async function reveal() {
	if (!(await canRevealFile(props.video))) {
		return;
	}

	hide.value = false;
}

// JUICE: ネイティブcontrolsのdblclickイベントはMouseEvent型で、mediaClickが期待する
// PointerEventとは型が異なる(実際の呼び出し側ではイベントの中身自体は使っていない)ためキャストする
function onDblClick(ev: MouseEvent) {
	emit('mediaClick', ev as unknown as PointerEvent);
}

// JUICE: インライン再生用。ライトボックス(MkLightbox.item.vue)と同じXControlを再利用するため、
// 同じDIキー(DI.mkLightboxItemMediaEl)へこの<video>要素をprovideする
const inlineVideoEl = useTemplateRef<HTMLVideoElement>('inlineVideoEl');
const mediaControl = useTemplateRef<InstanceType<typeof XControl>>('mediaControl');
const volume = ref(0.25);

provide(DI.mkLightboxItemMediaEl, computed(() => inlineVideoEl.value));

const isMediaPlaying = computed(() => mediaControl.value?.isPlaying ?? false);

function togglePlayPause() {
	if (inlineVideoEl.value == null) return;

	if (inlineVideoEl.value.paused) {
		// JUICE: 自動再生のブロック等でrejectしうるが、再生ボタンが出たままになるだけなので握りつぶす
		// (MkLightbox.item.vueのsafePlay()と同じ扱い)
		inlineVideoEl.value.play().catch(err => {
			if (_DEV_) console.warn('Failed to play media:', err);
		});
	} else {
		inlineVideoEl.value.pause();
	}
}

function showMenu(ev: PointerEvent) {
	os.popupMenu(getFileMenu(props.video, (newHide) => { hide.value = newHide; }), (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined);
}

function onContextmenu(ev: PointerEvent) {
	os.contextMenu(getFileMenu(props.video, (newHide) => { hide.value = newHide; }), ev);
}

defineExpose<MediaComponentExposes>({
	isRevealed: () => !hide.value,
	reveal,
});
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
	position: relative;
	overflow: clip;

	&:focus-visible {
		outline: none;
	}

	&:hover {
		.playIcon {
			scale: 1.2;
		}
	}
}

.sensitive {
	position: relative;

	&::after {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		border-radius: inherit;
		box-shadow: inset 0 0 0 4px var(--MI_THEME-warn);
	}
}

.hidden {
	width: 100%;
	height: 100%;
	background: #000;
	border: none;
	outline: none;
	font: inherit;
	color: inherit;
	cursor: pointer;
	padding: 12px 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.hiddenTextWrapper {
	text-align: center;
	font-size: 0.8em;
	color: #fff;
}

.videoRoot {
	background: #000;
	position: relative;
	width: 100%;
	height: 100%;
	object-fit: contain;
}

.video {
	display: block;
	height: 100%;
	width: 100%;
	object-fit: contain;
}

.playIconWrapper {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	display: grid;
	place-items: center;
	// JUICE: 純粋な見た目のオーバーレイなので、下にある<video>へのクリック/タップを妨げない
	pointer-events: none;
}

// JUICE: ライトボックスと同じ自作コントロール(XControl)を動画下端に重ねる。
// 半透明+グラデーションで境目を馴染ませる(ネイティブcontrolsのような唐突な帯にしない)
.inlineControls {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	padding: 10px 8px 6px;
	background: linear-gradient(to top, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0));
	color: #fff;
}

.playIcon {
	display: grid;
	place-items: center;
	width: 50px;
	height: 50px;
	border-radius: 100%;
	font-size: 120%;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	scale: 1;
	transition: scale 100ms ease;
}

.menu {
	display: block;
	position: absolute;
	background-color: rgba(0, 0, 0, 0.3);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	color: #fff;
	font-size: 0.8em;
	width: 28px;
	height: 28px;
	text-align: center;
}

.menuBottom {
	border-radius: 8px 0 8px 0;
	bottom: 0;
	right: 0;
}

.menuTopLeft {
	border-radius: 8px 0 8px 0;
	top: 0;
	left: 0;
}

.menuTop {
	border-radius: 0 8px 0 8px;
	top: 0;
	right: 0;
}
</style>
