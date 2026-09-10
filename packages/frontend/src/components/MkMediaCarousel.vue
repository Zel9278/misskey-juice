<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- JUICE: メディアタイムライン(PixelFed風)専用。複数枚添付時に1枚ずつスワイプで送る
     スライド表示にする。1枚のときはMkMediaList側のグリッド表示をそのまま使うため、
     このコンポーネントは呼び出し元(MkNote.vue)でfiles.length > 1の場合のみ使われる -->
<template>
<div>
	<div
		ref="track"
		:class="[$style.track, dragging && $style.dragging]"
		@scroll="onScroll"
		@pointerdown="onPointerDown"
		@pointermove="onPointerMove"
		@pointerup="endDrag"
		@pointercancel="endDrag"
		@click.capture="onTrackClickCapture"
	>
		<div v-for="media in medias.previewable" :key="media.id" :class="$style.slide">
			<XAudio
				v-if="media.type.startsWith('audio')"
				:class="$style.media"
				:audio="media"
			/>
			<XVideo
				v-else-if="media.type.startsWith('video')"
				:ref="(comp) => { mediaComponents.set(media.id, comp as InstanceType<typeof XVideo> | null); }"
				:class="$style.media"
				:video="media"
				:inlinePlayable="true"
				@mediaClick="onMediaClick(media)"
			/>
			<!-- JUICE: 画像本体のタップは(センシティブなら解除、それ以外は何もしない=スワイプの
			     ジェスチャー開始点として使える)に専念させる。@mediaClickを購読しないことで、
			     MkMediaImage内部の「非センシティブ時はクリックでライトボックスを開く」動作を
			     無効化している(reveal自体はcontrols内部で先に判定されるため影響を受けない) -->
			<XImage
				v-else-if="media.type.startsWith('image')"
				:ref="(comp) => { mediaComponents.set(media.id, comp as InstanceType<typeof XImage> | null); }"
				:marker="`${markerId}:${media.id}`"
				:disableImageLink="true"
				:class="$style.media"
				:image="media"
				:raw="raw"
			/>
			<!-- JUICE: 拡大鑑賞はこの独立したボタンからのみ行う。動画はネイティブのcontrolsに
			     全画面表示ボタンが含まれるため対象外(ボタンを置くと下部の操作バーと重なる) -->
			<button
				v-if="media.type.startsWith('image')"
				v-tooltip="i18n.ts._juice.mediaTimelineExpand"
				:class="$style.expandButton"
				class="_button"
				@click.stop="onMediaClick(media)"
			>
				<i class="ti ti-arrows-maximize"></i>
			</button>
		</div>
	</div>
	<div v-if="medias.previewable.length > 1" :class="$style.dots">
		<button
			v-for="(media, i) in medias.previewable"
			:key="media.id"
			:class="[$style.dot, { [$style.dotActive]: i === currentIndex }]"
			:aria-label="`${i + 1} / ${medias.previewable.length}`"
			class="_button"
			@click="scrollToIndex(i)"
		></button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import type { Content } from '@/components/MkLightbox.item.vue';
import type { MediaComponentExposes } from '@/types/media-component.js';
import XAudio from '@/components/MkMediaAudio.vue';
import XImage from '@/components/MkMediaImage.vue';
import XVideo from '@/components/MkMediaVideo.vue';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';
import { isPreviewable, getType } from '@/utility/lightbox.js';
import { genId } from '@/utility/id.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	mediaList: Misskey.entities.DriveFile[];
	user?: Misskey.entities.User | null;
	raw?: boolean;
}>();

const track = useTemplateRef('track');
const currentIndex = ref(0);
const dragging = ref(false);

// JUICE: overflow-x:autoへのホイール/タッチパン操作はブラウザ標準で効くが、
// マウスのクリック&ドラッグは標準では一切スクロールしない(すべてのブラウザ共通の仕様)ため、
// pointer eventsで手動のドラッグ操作(タッチ・マウス両対応)を実装する。
// 縦方向優先のドラッグは何もせず、ページの縦スクロールへ委譲する(方向ロック方式)
const dragState = {
	active: false,
	pointerId: null as number | null,
	startX: 0,
	startY: 0,
	scrollStart: 0,
	moved: false,
	locked: null as 'x' | 'y' | null,
};
let suppressNextClick = false;

function onPointerDown(ev: PointerEvent) {
	if (ev.pointerType === 'mouse' && ev.button !== 0) return;
	if (!track.value) return;
	dragState.active = true;
	dragState.pointerId = ev.pointerId;
	dragState.startX = ev.clientX;
	dragState.startY = ev.clientY;
	dragState.scrollStart = track.value.scrollLeft;
	dragState.moved = false;
	dragState.locked = null;
}

function onPointerMove(ev: PointerEvent) {
	if (!dragState.active || ev.pointerId !== dragState.pointerId || !track.value) return;
	const dx = ev.clientX - dragState.startX;
	const dy = ev.clientY - dragState.startY;

	if (dragState.locked === null) {
		if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
			dragState.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
			if (dragState.locked === 'x') {
				track.value.setPointerCapture(ev.pointerId);
				dragging.value = true;
			}
		}
	}

	if (dragState.locked === 'x') {
		dragState.moved = true;
		ev.preventDefault();
		track.value.scrollLeft = dragState.scrollStart - dx;
	}
}

function endDrag(ev: PointerEvent) {
	if (!dragState.active || ev.pointerId !== dragState.pointerId) return;
	dragState.active = false;
	dragging.value = false;
	if (dragState.locked === 'x') {
		if (track.value?.hasPointerCapture(ev.pointerId)) {
			track.value.releasePointerCapture(ev.pointerId);
		}
		// JUICE: ドラッグとして動いた分のclickは、画像のセンシティブ解除やライトボックス起動を
		// 誤爆させないよう握りつぶす(次のclickイベント1回だけキャプチャ段階で止める)
		if (dragState.moved) {
			suppressNextClick = true;
		}
	}
	dragState.locked = null;
}

function onTrackClickCapture(ev: MouseEvent) {
	if (suppressNextClick) {
		ev.stopPropagation();
		ev.preventDefault();
		suppressNextClick = false;
	}
}

const medias = computed(() => {
	const previewable: Misskey.entities.DriveFile[] = [];
	for (const file of props.mediaList) {
		if (isPreviewable(file.type)) previewable.push(file);
	}
	return { previewable };
});
const mediaComponents = new Map<string, MediaComponentExposes | null>();
const markerId = genId();

let scrollDebounce: number | null = null;

function onScroll() {
	if (scrollDebounce) window.clearTimeout(scrollDebounce);
	scrollDebounce = window.setTimeout(() => {
		if (!track.value) return;
		const width = track.value.clientWidth;
		if (width === 0) return;
		currentIndex.value = Math.round(track.value.scrollLeft / width);
	}, 100);
}

function scrollToIndex(i: number) {
	if (!track.value) return;
	track.value.scrollTo({ left: track.value.clientWidth * i, behavior: 'smooth' });
}

onUnmounted(() => {
	mediaComponents.clear();
	if (scrollDebounce) window.clearTimeout(scrollDebounce);
});

async function onMediaClick(file: Misskey.entities.DriveFile) {
	if (prefer.s.imageNewTab) {
		// JUICE: 新規タブで直接開く場合はファイルの生URLをそのまま開くことになり、
		// MkLightbox側のようなぼかし+タップして表示のゲートを経由しない。そのため
		// ここでだけ明示的にreveal()の同意フローを要求してから開く
		const component = mediaComponents.get(file.id);
		if (component?.isRevealed() === false) {
			await component.reveal();
			if (component.isRevealed() === false) return;
		}
		window.open(file.url, '_blank');
		return;
	}

	// JUICE: 拡大ボタンは1回のタップで即座にライトボックスを開く(「拡大して見たい」という
	// 明示的な意思表示として扱う)。センシティブでまだ解除していない画像でも、
	// MkLightbox.item.vue自身が未解除コンテンツをぼかして表示し、ライトボックス内で
	// 改めてタップするまで解除しないゲートを持っているため、ここで先に解除させる必要はない
	openGallery(file.id);
}

async function openGallery(id?: string) {
	if (id == null) {
		const firstImage = medias.value.previewable[0];
		if (firstImage == null) return;
		id = firstImage.id;
	}

	const getElementByMarker = (marker: string) => {
		if (track.value == null) return null;
		const found = track.value.querySelector(`[data-marker="${marker}"]`) as HTMLElement | null;
		if (found == null) return null;
		return markRaw(found);
	};

	const contents = medias.value.previewable.map<Content>(media => ({
		id: media.id,
		type: getType(media.type),
		url: media.url,
		thumbnailUrl: media.thumbnailUrl,
		width: media.properties.width,
		height: media.properties.height,
		filename: media.name,
		file: media,
		sourceElement: getElementByMarker(`${markerId}:${media.id}`),
	}));

	const initiallyRevealedContentIds = contents
		.filter(content => mediaComponents.get(content.id)?.isRevealed() === true)
		.map(content => content.id);

	// JUICE: センシティブフラグが無くても手動で隠されていたファイルは、ライトボックスでも隠した状態を維持する
	const initiallyHiddenContentIds = contents
		.filter(content => mediaComponents.get(content.id)?.isRevealed() === false)
		.map(content => content.id);

	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkLightbox.vue').then(x => x.default), {
		defaultIndex: contents.findIndex(content => content.id === id),
		contents: contents,
		initiallyRevealedContentIds,
		initiallyHiddenContentIds,
		user: props.user,
	}, {
		closed: () => dispose(),
	});
}

onMounted(() => {
	// JUICE: TSを黙らすため(将来のIntersectionObserver等の拡張余地)
	if (track.value == null) return;
});

defineExpose({
	openGallery,
});
</script>

<style lang="scss" module>
.track {
	display: flex;
	overflow-x: auto;
	scroll-snap-type: x mandatory;
	// JUICE: -webkit-overflow-scrolling:touchは、子要素のborder-radius+overflow:hiddenな
	// 角丸クリップがスクロール中(特に慣性スクロール中)だけ四角く見えてしまう既知のWebKitの
	// バグを誘発するため、あえて外す(現行のiOS Safariは指定なしでも慣性スクロールする)
	scrollbar-width: none;
	cursor: grab;
	user-select: none;
	// JUICE: 横方向はJS側(pointer events)で手動ドラッグを実装しているため、ブラウザ標準の
	// タッチパンは縦方向のみ許可する(pan-y)。これにより縦優先のドラッグはそのままページの
	// 縦スクロールへ渡り、横優先のドラッグだけをJSが横取りしてスワイプとして処理できる
	touch-action: pan-y;

	&::-webkit-scrollbar {
		display: none;
	}
}

.dragging {
	cursor: grabbing;
	scroll-snap-type: none;
}

.slide {
	position: relative;
	flex: 0 0 100%;
	scroll-snap-align: center;
	aspect-ratio: 1 / 1;
}

.media {
	width: 100%;
	height: 100%;
	cursor: default;
	// JUICE: MkMediaList.vueの.mediaと同じ角丸+overflow:hiddenを付ける(素のXImageをここで
	// 直接使っているため、MkMediaListが標準で付けている角丸がここでは無いと付与されない)
	overflow: hidden;
	border-radius: 8px;
	// JUICE: border-radius+overflow:hiddenな要素は、祖先(.track)がスクロール中だとブラウザが
	// 角丸のクリップマスクを省略した高速パスで描画し、ドラッグ中だけ角が四角くなることがある
	// (WebKit/Chromium系の既知の挙動)。この要素を常時GPUの独立レイヤーに昇格させ、
	// さらにmask-imageでクリップさせることで、overflow:hiddenのクリップ用高速パスを迂回する
	transform: translateZ(0);
	-webkit-mask-image: -webkit-radial-gradient(white, black);
	// JUICE: ブラウザ標準の画像ドラッグ(ゴースト画像)がスワイプジェスチャーを奪ってしまうため無効化する
	-webkit-user-drag: none;
	user-select: none;
}

// JUICE: MkMediaImage.vueの.menu/.menuTopと同じ見た目に揃える(Misskey標準のメディア隅ボタンの意匠)。
// 左下に置くのは、右上=センシティブ解除トグル・右下=「…」メニュー・左上=センシティブ/AI生成等の
// インジケータバッジ(MkMediaImage.vue側)とそれぞれ被らない、唯一空いている角のため
.expandButton {
	display: block;
	position: absolute;
	z-index: 1;
	bottom: 0;
	left: 0;
	width: 28px;
	height: 28px;
	border-radius: 0 8px 0 8px;
	color: #fff;
	font-size: 0.8em;
	background-color: rgba(0, 0, 0, 0.3);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}

// JUICE: 画像の上に重ねるオーバーレイではなく、画像の下の通常フローに置く(PixelFed本家と同じ配置)。
// これで写真の内容にドットが被らない
.dots {
	display: flex;
	justify-content: center;
	align-items: center;
	gap: 6px;
	padding: 6px 0 0;
}

.dot {
	// JUICE: グローバルリセットでbox-sizing:border-boxになっているため、明示的にcontent-boxへ
	// 戻さないと「width:5px以下にpadding:5pxが食い込んで実質0px」になり、背景色(丸)が
	// 見た目上消える。content-boxにしてwidth/heightを純粋な中身のサイズとして扱わせる
	box-sizing: content-box;
	width: 5px;
	height: 5px;
	// JUICE: 当たり判定は少し広めに取りつつ、見た目のドット自体は小さく保つ
	// (background-clipで中央だけ着色し、paddingの分は透明な余白にする)
	padding: 5px;
	background: #dbdbdb;
	background-clip: content-box;
	border-radius: 50%;
	transition: background-color 0.2s;
}

.dotActive {
	background: var(--MI_THEME-accent);
}
</style>
