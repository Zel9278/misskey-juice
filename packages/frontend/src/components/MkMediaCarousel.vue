<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- JUICE: メディアタイムライン(PixelFed風)専用。複数枚添付時に1枚ずつスワイプで送る
     スライド表示にする。1枚のときはMkMediaList側のグリッド表示をそのまま使うため、
     このコンポーネントは呼び出し元(MkNote.vue)でfiles.length > 1の場合のみ使われる -->
<template>
<div :class="$style.root">
	<!-- JUICE: 左右送りボタンのheight:100%を.track(画像本体)基準で揃えるための
	     ラッパー。下の.dotsはこの外側に置き、ボタンの縦中央が.dotsの分だけ
	     ズレないようにする -->
	<div :class="$style.trackWrapper">
	<div
		ref="track"
		:class="[$style.track, (dragging || animating) && $style.dragging]"
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
				:ref="(comp) => { mediaComponents.set(media.id, comp as InstanceType<typeof XAudio> | null); }"
				:class="$style.media"
				:audio="media"
				:user="user"
				:inlinePlayable="true"
				@mediaClick="onMediaClick(media)"
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
	<!-- JUICE: スワイプ操作ができないマウス操作時のみ、左右送りボタンを表示する
	     (タッチ操作時はスワイプ自体が主操作のため、画像に重なるボタンは邪魔になるだけで表示しない) -->
	<button
		v-if="!isTouchUsing && currentIndex > 0"
		v-tooltip="i18n.ts._juice.mediaTimelinePrev"
		:aria-label="i18n.ts._juice.mediaTimelinePrev"
		class="_button"
		:class="[$style.navButton, $style.prevButton]"
		@click.stop="goToIndex(currentIndex - 1)"
	><div :class="$style.navButtonIcon"><i class="ti ti-chevron-left"></i></div></button>
	<button
		v-if="!isTouchUsing && currentIndex < medias.previewable.length - 1"
		v-tooltip="i18n.ts._juice.mediaTimelineNext"
		:aria-label="i18n.ts._juice.mediaTimelineNext"
		class="_button"
		:class="[$style.navButton, $style.nextButton]"
		@click.stop="goToIndex(currentIndex + 1)"
	><div :class="$style.navButtonIcon"><i class="ti ti-chevron-right"></i></div></button>
	</div>
	<div v-if="medias.previewable.length > 1" :class="$style.dots">
		<button
			v-for="(media, i) in medias.previewable"
			:key="media.id"
			:class="[$style.dot, { [$style.dotActive]: i === currentIndex }]"
			:aria-label="`${i + 1} / ${medias.previewable.length}`"
			class="_button"
			@click="goToIndex(i)"
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
import { isTouchUsing } from '@/utility/touch.js';

const props = defineProps<{
	mediaList: Misskey.entities.DriveFile[];
	user?: Misskey.entities.User | null;
	raw?: boolean;
}>();

const track = useTemplateRef('track');
const currentIndex = ref(0);
const dragging = ref(false);
// JUICE: goToIndex()由来のJSアニメーション(animateScrollTo)実行中かどうか。この間もdraggingと
// 同様にネイティブのscroll-snapを止めておかないと、低速端末でアニメーションの途中フレームに
// ネイティブsnapが介入してチラつく可能性があるため、CSS上はdraggingと合わせて扱う
const animating = ref(false);

// JUICE: overflow-x:autoへのホイール/タッチパン操作はブラウザ標準で効くが、
// マウスのクリック&ドラッグは標準では一切スクロールしない(すべてのブラウザ共通の仕様)ため、
// pointer eventsで手動のドラッグ操作(タッチ・マウス両対応)を実装する。
// 縦方向優先のドラッグは何もせず、ページの縦スクロールへ委譲する(方向ロック方式)
const AXIS_SWIPE_HYSTERESIS = 8;
// JUICE: スワイプが成立する速度(px/ms)。距離が足りなくても、この速度を超える素早いフリックなら次/前に送る
const MIN_VELOCITY_TO_SWIPE = 0.4;
// JUICE: 速度を平均する時間窓(ms)。指を止めたまま離した場合に直前のフリックの速度が残るのを防ぐ
const VELOCITY_WINDOW = 100;
// JUICE: ブラウザ標準のscroll-snap(ドラッグ量が概ね50%を超えないと次に送られない)は判定が
// 厳しすぎるため、トラック幅に対するこの比率(距離)か、MIN_VELOCITY_TO_SWIPE(速度)の
// どちらか一方を満たせば次/前に送られる、より緩い自前の判定に置き換える
const SWIPE_DISTANCE_RATIO = 0.15;

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
let velocitySamples: { time: number; x: number }[] = [];

function pushVelocitySample(time: number, x: number) {
	velocitySamples.push({ time, x });
	while (velocitySamples.length > 2 && time - velocitySamples[0].time > VELOCITY_WINDOW) {
		velocitySamples.shift();
	}
}

function getVelocityX(now: number): number {
	if (velocitySamples.length < 2) return 0;
	const latest = velocitySamples[velocitySamples.length - 1];
	if (now - latest.time > VELOCITY_WINDOW) return 0;
	const oldest = velocitySamples[0];
	const duration = latest.time - oldest.time;
	if (duration <= 0) return 0;
	return (latest.x - oldest.x) / duration;
}

function onPointerDown(ev: PointerEvent) {
	if (ev.pointerType === 'mouse' && ev.button !== 0) return;
	if (!track.value) return;
	// JUICE: ボタン/ドット操作によるanimateScrollTo実行中に、その画像を直接ドラッグし始めた場合、
	// rAFループとドラッグの両方がscrollLeftを奪い合ってチラつくのを防ぐため、進行中のアニメーションを中断する
	if (scrollAnimFrame != null) {
		window.cancelAnimationFrame(scrollAnimFrame);
		scrollAnimFrame = null;
	}
	animating.value = false;
	dragState.active = true;
	dragState.pointerId = ev.pointerId;
	dragState.startX = ev.clientX;
	dragState.startY = ev.clientY;
	dragState.scrollStart = track.value.scrollLeft;
	dragState.moved = false;
	dragState.locked = null;
	velocitySamples = [];
	pushVelocitySample(ev.timeStamp, ev.clientX);
}

function onPointerMove(ev: PointerEvent) {
	if (!dragState.active || ev.pointerId !== dragState.pointerId || !track.value) return;
	const dx = ev.clientX - dragState.startX;
	const dy = ev.clientY - dragState.startY;

	if (dragState.locked === null) {
		if (Math.abs(dx) > AXIS_SWIPE_HYSTERESIS || Math.abs(dy) > AXIS_SWIPE_HYSTERESIS) {
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
		pushVelocitySample(ev.timeStamp, ev.clientX);
	}
}

function endDrag(ev: PointerEvent) {
	if (!dragState.active || ev.pointerId !== dragState.pointerId) return;
	dragState.active = false;
	dragging.value = false;

	if (dragState.locked === 'x' && track.value) {
		if (track.value.hasPointerCapture(ev.pointerId)) {
			track.value.releasePointerCapture(ev.pointerId);
		}
		if (dragState.moved) {
			// JUICE: ドラッグとして動いた分のclickは、画像のセンシティブ解除やライトボックス起動を
			// 誤爆させないよう握りつぶす(次のclickイベント1回だけキャプチャ段階で止める)
			suppressNextClick = true;

			const totalSwipeX = ev.clientX - dragState.startX;
			const velocityX = getVelocityX(ev.timeStamp);
			const distanceThreshold = track.value.clientWidth * SWIPE_DISTANCE_RATIO;

			const shouldNext = totalSwipeX < -distanceThreshold || (totalSwipeX < 0 && velocityX < -MIN_VELOCITY_TO_SWIPE);
			const shouldPrev = totalSwipeX > distanceThreshold || (totalSwipeX > 0 && velocityX > MIN_VELOCITY_TO_SWIPE);

			if (shouldNext) {
				goToIndex(currentIndex.value + 1);
			} else if (shouldPrev) {
				goToIndex(currentIndex.value - 1);
			} else {
				// JUICE: 閾値未満のドラッグは元の位置へ戻す(ネイティブのscroll-snapには委ねない。
				// dragging.value=falseでsnapが復活すると、ここでの自前アニメーションと競合しうるため)
				goToIndex(currentIndex.value);
			}
		}
	}
	dragState.locked = null;
	velocitySamples = [];
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

// JUICE: スライド切り替えのアニメーション時間(ms)。ブラウザ標準のscrollTo({behavior:'smooth'})は
// 数百msかかり、1ノートに枚数が多いと連続して送るたびに待たされて遅く感じるため、
// 自前でrequestAnimationFrame駆動の短い(かつ一貫した)アニメーションに置き換える
const SLIDE_ANIM_DURATION = 180;
let scrollAnimFrame: number | null = null;

function animateScrollTo(target: number) {
	if (!track.value) return;
	const el = track.value;
	if (scrollAnimFrame != null) {
		window.cancelAnimationFrame(scrollAnimFrame);
		scrollAnimFrame = null;
	}
	const start = el.scrollLeft;
	const delta = target - start;
	if (Math.abs(delta) < 1) {
		el.scrollLeft = target;
		animating.value = false;
		return;
	}
	if (!prefer.s.animation) {
		el.scrollLeft = target;
		animating.value = false;
		return;
	}
	// JUICE: この間もネイティブのscroll-snapを止めておく(.trackのCSS参照)。
	// アニメーション完了前に次の操作でanimateScrollToが呼ばれた場合は、その呼び出し冒頭の
	// cancelAnimationFrameで打ち切られるだけで、animating自体はtrueのまま引き継がれる
	animating.value = true;
	const startTime = performance.now();

	function step(now: number) {
		const elapsed = now - startTime;
		const t = Math.min(1, elapsed / SLIDE_ANIM_DURATION);
		// ease-out cubic
		const eased = 1 - ((1 - t) ** 3);
		el.scrollLeft = start + (delta * eased);
		if (t < 1) {
			scrollAnimFrame = window.requestAnimationFrame(step);
		} else {
			scrollAnimFrame = null;
			animating.value = false;
		}
	}

	scrollAnimFrame = window.requestAnimationFrame(step);
}

function scrollToIndex(i: number) {
	if (!track.value) return;
	animateScrollTo(track.value.clientWidth * i);
}

function goToIndex(i: number) {
	const clamped = Math.max(0, Math.min(medias.value.previewable.length - 1, i));
	currentIndex.value = clamped;
	scrollToIndex(clamped);
}

onUnmounted(() => {
	mediaComponents.clear();
	if (scrollDebounce) window.clearTimeout(scrollDebounce);
	if (scrollAnimFrame != null) window.cancelAnimationFrame(scrollAnimFrame);
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
.root {
	position: relative;
}

// JUICE: .trackWrapperを.track(画像本体)のみを包むポジショニングコンテキストにする。
// これにより.navButtonのheight:100%が.dots分の高さを含む.rootではなく.trackだけを
// 基準に取れるため、送りボタンが画像の縦中央からズレない
.trackWrapper {
	position: relative;
}

// JUICE: マウス操作時のみ表示する左右送りボタン。常時表示だとタイムライン上に並ぶ
// 複数のカードすべてに丸ボタンが乗って煩雑になるため、ホバー時のみ浮かび上がらせる
.navButton {
	position: absolute;
	z-index: 1;
	top: 50%;
	transform: translateY(-50%);
	display: grid;
	place-items: center;
	color: #fff;
	opacity: 0;
	transition: opacity 0.15s;
}

.trackWrapper:hover .navButton {
	opacity: 1;
}

.navButtonIcon {
	width: 32px;
	height: 32px;
	display: grid;
	place-items: center;
	font-size: 1.1em;
	background-color: rgba(0, 0, 0, 0.35);
	border-radius: 100%;
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}

.prevButton {
	left: 8px;
}

.nextButton {
	right: 8px;
}

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
