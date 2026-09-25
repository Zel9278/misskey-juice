<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- JUICE: 絵チャ(お絵かきチャット)の部屋 -->
<template>
<PageWithHeader :actions="headerActions">
	<MkLoading v-if="room == null && error == null"/>
	<MkError v-else-if="error != null" @retry="init()"/>
	<!-- JUICE: デッキ・ウインドウの中でも崩れないよう、画面全体ではなくこの枠の大きさで表示を切り替える -->
	<div v-else-if="room != null" ref="frameEl" :class="$style.frame">
	<div :class="$style.root">
		<div :class="$style.main">
			<!-- 参加状態・終了後の操作 -->
			<div :class="$style.status">
				<template v-if="room.isEnded">
					<div :class="$style.statusText"><i class="ti ti-archive"></i> {{ room.keepAfterEnd ? i18n.ts._drawRoom.ended : i18n.ts._drawRoom.endedNotKept }}</div>
					<div :class="$style.statusButtons">
						<MkButton small @click="saveImageToDrive"><i class="ti ti-cloud-upload"></i> {{ i18n.ts._drawRoom.saveImage }}</MkButton>
						<MkButton small @click="postImage"><i class="ti ti-pencil"></i> {{ i18n.ts._drawRoom.postImage }}</MkButton>
						<MkButton small @click="downloadImage"><i class="ti ti-download"></i> {{ i18n.ts._drawRoom.downloadImage }}</MkButton>
						<MkButton small @click="startSelecting"><i class="ti ti-crop"></i> {{ i18n.ts._drawRoom.selectArea }}</MkButton>
						<MkButton v-if="isOwner && room.keepAfterEnd" small danger @click="deleteRoom()"><i class="ti ti-trash"></i> {{ i18n.ts._drawRoom.deleteRoom }}</MkButton>
					</div>
				</template>
				<!-- JUICE: モデレーターが公開範囲の外から確認のために開いている(見るだけ) -->
				<template v-else-if="room.viewOnly">
					<div :class="$style.statusText"><i class="ti ti-shield"></i> {{ i18n.ts._drawRoom.viewingAsModerator }}</div>
				</template>
				<template v-else-if="!room.isMember">
					<div :class="$style.statusText"><i class="ti ti-eye"></i> {{ isFull ? i18n.ts._drawRoom.full : i18n.ts._drawRoom.spectating }}</div>
					<MkButton v-if="!isFull" small primary @click="join"><i class="ti ti-brush"></i> {{ i18n.ts._drawRoom.join }}</MkButton>
				</template>
				<template v-else>
					<!-- ツール -->
					<div :class="$style.tools">
						<button v-tooltip="i18n.ts._drawRoom.pen" class="_button" :class="[$style.toolButton, { [$style.toolButtonActive]: tool === 'pen' }]" :aria-label="i18n.ts._drawRoom.pen" :aria-pressed="tool === 'pen'" @click="tool = 'pen'"><i class="ti ti-pencil"></i></button>
						<button v-tooltip="i18n.ts._drawRoom.eraser" class="_button" :class="[$style.toolButton, { [$style.toolButtonActive]: tool === 'eraser' }]" :aria-label="i18n.ts._drawRoom.eraser" :aria-pressed="tool === 'eraser'" @click="tool = 'eraser'"><i class="ti ti-eraser"></i></button>
						<button v-tooltip="i18n.ts._drawRoom.eyedropperHint" class="_button" :class="[$style.toolButton, { [$style.toolButtonActive]: tool === 'eyedropper' }]" :aria-label="i18n.ts._drawRoom.eyedropper" :aria-pressed="tool === 'eyedropper'" @click="tool = 'eyedropper'"><i class="ti ti-color-picker"></i></button>
						<!-- JUICE: スマホでは色・太さ・濃さをまとめたボタンにし、押すとキャンバスの上に選ぶ欄を出す -->
						<button
							class="_button"
							:class="[$style.brushButton, { [$style.toolButtonActive]: brushPanelOpen }]"
							:aria-label="`${i18n.ts._drawRoom.color} / ${i18n.ts._drawRoom.size}`"
							:aria-expanded="brushPanelOpen"
							@click="brushPanelOpen = !brushPanelOpen"
						>
							<span :class="$style.brushPreview" :style="{ background: color, opacity: opacity / 100 }"></span>
							<span :class="$style.sizeValue">{{ size }}</span>
						</button>
						<div :class="[$style.brushOptions, { [$style.brushOptionsOpen]: brushPanelOpen }]">
						<span :class="$style.toolSeparator"></span>
						<button
							v-for="c in PALETTE"
							:key="c"
							v-tooltip="c"
							class="_button"
							:class="[$style.swatch, { [$style.swatchActive]: color === c && tool === 'pen' }]"
							:style="{ background: c }"
							:aria-label="`${i18n.ts._drawRoom.color}: ${c}`"
							:aria-pressed="color === c && tool === 'pen'"
							@click="color = c; tool = 'pen'"
						></button>
						<input v-model="color" type="color" :class="$style.colorInput" :aria-label="i18n.ts._drawRoom.color" @input="tool = 'pen'"/>
						<span :class="$style.toolSeparator"></span>
						<label :class="$style.sizeLabel">
							<i class="ti ti-line-dashed"></i>
							<input v-model.number="size" type="range" min="1" :max="sizeMax" step="1" :aria-label="i18n.ts._drawRoom.size"/>
							<span :class="$style.sizeValue">{{ size }}</span>
						</label>
						<label v-tooltip="i18n.ts._drawRoom.opacity" :class="$style.sizeLabel">
							<i class="ti ti-droplet-half-2"></i>
							<input v-model.number="opacity" type="range" min="5" max="100" step="5" :aria-label="i18n.ts._drawRoom.opacity"/>
							<span :class="$style.sizeValue">{{ opacity }}%</span>
						</label>
						</div>
						<span :class="$style.toolSeparator"></span>
						<button v-tooltip="i18n.ts._drawRoom.undo" class="_button" :class="$style.toolButton" :aria-label="i18n.ts._drawRoom.undo" @click="undo"><i class="ti ti-arrow-back-up"></i></button>
						<button v-tooltip="i18n.ts._drawRoom.clearMyLayer" class="_button" :class="$style.toolButton" :aria-label="i18n.ts._drawRoom.clearMyLayer" @click="clearMyLayer"><i class="ti ti-trash"></i></button>
					</div>
					<MkButton v-if="!isOwner" small @click="leave">{{ i18n.ts._drawRoom.leave }}</MkButton>
				</template>
				<!-- JUICE: スマホでは、レイヤーとチャットを下から出すパネルにする -->
				<div :class="$style.statusEnd">
				<!-- JUICE: 開催中・終了後どちらでも、全体または選んだ範囲を画像(PNG)にして保存・投稿できる -->
				<button
					v-tooltip="i18n.ts._drawRoom.imageMenu"
					class="_button"
					:class="[$style.toolButton, { [$style.toolButtonActive]: selecting }]"
					:aria-label="i18n.ts._drawRoom.imageMenu"
					@click="openImageMenu"
				><i class="ti ti-photo-down"></i></button>
				<div :class="$style.sheetButtons">
					<button
						class="_button"
						:class="[$style.toolButton, { [$style.toolButtonActive]: mobilePanel === 'layers' }]"
						:aria-label="i18n.ts._drawRoom.layers"
						:aria-pressed="mobilePanel === 'layers'"
						@click="toggleMobilePanel('layers')"
					><i class="ti ti-stack-2"></i></button>
					<button
						class="_button"
						:class="[$style.toolButton, { [$style.toolButtonActive]: mobilePanel === 'chat' }]"
						:aria-label="i18n.ts._drawRoom.chat"
						:aria-pressed="mobilePanel === 'chat'"
						@click="toggleMobilePanel('chat')"
					>
						<i class="ti ti-messages"></i>
						<span v-if="chatUnread" :class="$style.unreadDot"></span>
					</button>
				</div>
				</div>
			</div>

			<!-- キャンバス。拡大縮小・移動はCSSのtransformで行い、座標は表示上の大きさから逆算する -->
			<div
				ref="viewportEl"
				:class="$style.viewport"
				@pointerdown="onPointerDown"
				@pointermove="onPointerMove"
				@pointerup="onPointerUp"
				@pointercancel="onPointerUp"
				@pointerleave="onPointerLeave"
				@wheel.prevent="onWheel"
				@contextmenu.prevent
			>
				<!-- JUICE: 表示用のキャンバスの上に、描いている途中のペンの線を描くキャンバス(不透明・半透明)を重ねる -->
				<div :class="$style.canvasStack" :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }">
					<canvas
						ref="canvasEl"
						:class="[$style.canvas, { [$style.canvasDrawable]: canDraw, [$style.canvasPicking]: canDraw && tool === 'eyedropper' }]"
					></canvas>
					<canvas ref="overlayEl" :class="$style.canvasOverlay"></canvas>
					<canvas ref="overlayAlphaEl" :class="$style.canvasOverlay"></canvas>
				</div>
				<!-- JUICE: ほかの人のカーソル(位置の点と、丸いアイコン) -->
				<div
					v-for="[userId, cursor] in cursors"
					:key="userId"
					:class="$style.cursor"
					:style="{ transform: `translate(${view.x + cursor.x * view.scale}px, ${view.y + cursor.y * view.scale}px)` }"
				>
					<span :class="$style.cursorDot"></span>
					<MkAvatar v-if="userMap.get(userId)" :class="$style.cursorAvatar" :user="userMap.get(userId)!"/>
				</div>
				<!-- JUICE: 保存する範囲の選択 -->
				<div v-if="selecting && selection != null" :class="$style.selection" :style="selectionStyle"></div>
				<div v-if="selecting" :class="$style.selectionBar" @pointerdown.stop @pointermove.stop @pointerup.stop>
					<span v-if="selection == null || selection.width < 1" :class="$style.selectionHint"><i class="ti ti-crop"></i> {{ i18n.ts._drawRoom.selectAreaHint }}</span>
					<template v-else>
						<span :class="$style.selectionHint">{{ selection.width }}×{{ selection.height }}</span>
						<select v-model="imageFormat" :class="$style.selectionFormat" :aria-label="i18n.ts._drawRoom.imageFormat">
							<option v-for="option in imageFormatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
						</select>
						<button class="_button" :class="$style.selectionAction" @click="saveImageToDrive(selection)"><i class="ti ti-cloud-upload"></i> {{ i18n.ts._drawRoom.saveImage }}</button>
						<button class="_button" :class="$style.selectionAction" @click="postImage(selection)"><i class="ti ti-pencil"></i> {{ i18n.ts._drawRoom.postImage }}</button>
						<button class="_button" :class="$style.selectionAction" @click="downloadImage(selection)"><i class="ti ti-download"></i> {{ i18n.ts._drawRoom.downloadImage }}</button>
					</template>
					<button v-tooltip="i18n.ts.cancel" class="_button" :class="$style.selectionAction" :aria-label="i18n.ts.cancel" @click="cancelSelecting"><i class="ti ti-x"></i></button>
				</div>
				<!-- JUICE: 全体マップ。今表示している範囲を枠で示し、押した・なぞった位置へ表示を移す -->
				<div :class="$style.minimap" @pointerdown.stop @pointermove.stop @pointerup.stop @wheel.stop.prevent>
					<div
						v-show="showMinimap"
						:class="$style.minimapBody"
						:style="{ width: `${minimapSize.width}px`, height: `${minimapSize.height}px` }"
						role="img"
						:aria-label="i18n.ts._drawRoom.minimap"
						@pointerdown="onMinimapPointerDown"
						@pointermove="onMinimapPointerMove"
						@pointerup="onMinimapPointerUp"
						@pointercancel="onMinimapPointerUp"
					>
						<canvas ref="minimapEl" :class="$style.minimapCanvas" :width="minimapSize.width" :height="minimapSize.height"></canvas>
						<div :class="$style.minimapFrame" :style="minimapFrameStyle"></div>
					</div>
					<div :class="$style.minimapBar">
						<button v-tooltip="i18n.ts._drawRoom.fitToScreen" class="_button" :class="$style.zoomLevel" :aria-label="i18n.ts._drawRoom.fitToScreen" @click="fitToScreen">{{ Math.round(view.scale * 100) }}%</button>
						<button
							v-tooltip="showMinimap ? i18n.ts._drawRoom.hideMinimap : i18n.ts._drawRoom.showMinimap"
							class="_button"
							:class="$style.minimapToggle"
							:aria-label="showMinimap ? i18n.ts._drawRoom.hideMinimap : i18n.ts._drawRoom.showMinimap"
							:aria-pressed="showMinimap"
							@click="showMinimap = !showMinimap"
						>
							<i class="ti ti-map"></i>
						</button>
					</div>
				</div>
			</div>
		</div>

		<div :class="[$style.side, { [$style.sideOpen]: mobilePanel != null }]">
			<!-- 描いている人・レイヤー -->
			<div class="_panel" :class="[$style.sidePanel, $style.layers, { [$style.sheetHidden]: mobilePanel !== 'layers' }]">
				<div :class="$style.sideHeader">
					<i class="ti ti-stack-2"></i> {{ i18n.ts._drawRoom.layers }} <span :class="$style.memberCount">{{ i18n.tsx._drawRoom.membersCount({ n: room.members.length, max: room.maxMembers }) }}</span>
					<button class="_button" :class="$style.sheetClose" :aria-label="i18n.ts.close" @click="mobilePanel = null"><i class="ti ti-x"></i></button>
				</div>
				<div v-if="!room.isEnded" :class="$style.onlineSummary"><span :class="$style.onlineDotInline"></span> {{ i18n.tsx._drawRoom.onlineCount({ n: onlineUserIds.size }) }}</div>
				<div v-for="userId in listedUserIds" :key="userId" :class="[$style.layerRow, { [$style.layerRowOffline]: !room.isEnded && !onlineUserIds.has(userId) }]">
					<!-- JUICE: 今この部屋を開いている人は緑の点、閉じている人は薄く表示する -->
					<span :class="$style.layerAvatarWrap">
						<MkAvatar v-if="userMap.get(userId)" :class="$style.layerAvatar" :user="userMap.get(userId)!"/>
						<span
							v-if="!room.isEnded"
							v-tooltip="onlineUserIds.has(userId) ? i18n.ts._drawRoom.online : i18n.ts._drawRoom.offline"
							:class="[$style.presenceDot, { [$style.presenceDotOnline]: onlineUserIds.has(userId) }]"
							role="img"
							:aria-label="onlineUserIds.has(userId) ? i18n.ts._drawRoom.online : i18n.ts._drawRoom.offline"
						></span>
					</span>
					<span :class="$style.layerName">
						<MkUserName v-if="userMap.get(userId)" :user="userMap.get(userId)!"/>
						<i v-if="userId === room.ownerId" v-tooltip="i18n.ts._drawRoom.owner" class="ti ti-crown" :class="$style.ownerIcon" role="img" :aria-label="i18n.ts._drawRoom.owner"></i>
						<i v-if="room.members.some(m => m.id === userId)" v-tooltip="i18n.ts._drawRoom.members" class="ti ti-brush" :class="$style.drawingIcon" role="img" :aria-label="i18n.ts._drawRoom.members"></i>
					</span>
					<i v-if="!layerUserIds.includes(userId)" v-tooltip="i18n.ts._drawRoom.spectating" class="ti ti-eye" :class="$style.drawingIcon" role="img" :aria-label="i18n.ts._drawRoom.spectating"></i>
					<button
						v-if="layerUserIds.includes(userId)"
						v-tooltip="hiddenLayers.has(userId) ? i18n.ts.show : i18n.ts.hide"
						class="_button"
						:class="$style.layerButton"
						:aria-label="hiddenLayers.has(userId) ? i18n.ts.show : i18n.ts.hide"
						:aria-pressed="!hiddenLayers.has(userId)"
						@click="toggleLayer(userId)"
					><i :class="hiddenLayers.has(userId) ? 'ti ti-eye-off' : 'ti ti-eye'"></i></button>
					<button
						v-if="isOwner && !room.isEnded && userId !== room.ownerId && room.members.some(m => m.id === userId)"
						v-tooltip="i18n.ts._drawRoom.kick"
						class="_button"
						:class="$style.layerButton"
						:aria-label="i18n.ts._drawRoom.kick"
						@click="kick(userId)"
					><i class="ti ti-user-minus"></i></button>
				</div>
				<MkSwitch v-model="myLayerOnTop" :class="$style.layerSwitch">
					<template #label>{{ i18n.ts._drawRoom.myLayerOnTop }}</template>
				</MkSwitch>
			</div>

			<!-- チャット -->
			<div class="_panel" :class="[$style.sidePanel, $style.chat, { [$style.sheetHidden]: mobilePanel !== 'chat' }]">
				<div :class="$style.sideHeader">
					<i class="ti ti-messages"></i> {{ i18n.ts._drawRoom.chat }}
					<button class="_button" :class="$style.sheetClose" :aria-label="i18n.ts.close" @click="mobilePanel = null"><i class="ti ti-x"></i></button>
				</div>
				<div ref="chatListEl" :class="$style.chatList">
					<div v-for="item in chatMessages" :key="item.message.id" :class="$style.chatItem">
						<MkAvatar :class="$style.chatAvatar" :user="item.user"/>
						<div :class="$style.chatBody">
							<div :class="$style.chatName"><MkUserName :user="item.user"/></div>
							<div :class="$style.chatText">{{ item.message.text }}</div>
						</div>
						<!-- JUICE: ほかの人の発言は通報できる -->
						<button
							v-if="item.user.id !== $i.id && !room.viewOnly"
							v-tooltip="i18n.ts.menu"
							class="_button"
							:class="$style.chatMenuButton"
							:aria-label="i18n.ts.menu"
							@click="openChatMenu($event, item)"
						><i class="ti ti-dots"></i></button>
					</div>
				</div>
				<form v-if="!room.isEnded && !room.viewOnly" :class="$style.chatForm" @submit.prevent="sendChat">
					<input v-model="chatText" :class="$style.chatInput" type="text" maxlength="500" :placeholder="i18n.ts._drawRoom.chatPlaceholder" :aria-label="i18n.ts._drawRoom.chatPlaceholder"/>
					<button v-tooltip="i18n.ts.send" class="_button" :class="$style.chatSend" type="submit" :disabled="chatText.trim().length === 0" :aria-label="i18n.ts.send"><i class="ti ti-send"></i></button>
				</form>
			</div>
		</div>
	</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { url } from '@@/js/config.js';
import { uploadFile } from '@/utility/drive.js';
import { readAndCompressImage } from '@misskey-dev/browser-image-resizer';
import { getCompressionSettings } from '@/composables/use-uploader.js';
import { prefer } from '@/preferences.js';
import { isWebpSupported } from '@/utility/isWebpSupported.js';
import { encodeUncompressedPng } from '@/utility/uncompressed-png.js';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { ensureSignin, iAmModerator } from '@/i.js';
import { DRAW_ROOM_CANVAS_MAX_SIZE, DRAW_ROOM_CANVAS_MIN_SIZE, DrawCanvasEngine, POINT_SCALE, THUMBNAIL_MAX_SIZE, brushSizeRange, clampCanvasSize, clampMaxMembers, decodePoints, decodeStroke, encodePoints } from '@/utility/draw-canvas.js';
import type { CanvasStroke, DrawTool } from '@/utility/draw-canvas.js';

const props = defineProps<{
	roomId: string;
}>();

const $i = ensureSignin();
const router = useRouter();

// JUICE: よく使う色。これ以外はカラーピッカーで選ぶ
// JUICE: スマホ向けの表示。色・太さの欄と、下から出すパネル(レイヤー・チャット)の開閉
const brushPanelOpen = ref(false);
const mobilePanel = ref<'layers' | 'chat' | null>(null);
const chatUnread = ref(false);
// スマホ向けの表示になっているか(画面全体ではなく部屋の枠の幅で決める。CSSの @container と同じ基準)
const NARROW_MAX_WIDTH = 800;
const frameEl = useTemplateRef('frameEl');
const isNarrow = ref(false);
watch(frameEl, (el, _old, onCleanup) => {
	if (el == null) return;
	const observer = new ResizeObserver(() => {
		isNarrow.value = el.clientWidth <= NARROW_MAX_WIDTH;
	});
	observer.observe(el);
	onCleanup(() => observer.disconnect());
});

function toggleMobilePanel(panel: 'layers' | 'chat'): void {
	mobilePanel.value = mobilePanel.value === panel ? null : panel;
	brushPanelOpen.value = false;
	if (mobilePanel.value === 'chat') {
		chatUnread.value = false;
		scrollChatToBottom();
	}
}

const PALETTE = ['#000000', '#ffffff', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#6d4c41', '#9e9e9e'];
// 描いている途中の線を送る間隔(ms)と、1回に送る点の最大数(サーバー側の上限に合わせる)
const STROKE_PART_INTERVAL_MS = 50;
const STROKE_PART_MAX_POINTS = 500;
// 1本の線の点の最大数(サーバー側の上限)。これを超えたら線を区切って続ける
const STROKE_MAX_POINTS = 5000;

const room = ref<Misskey.entities.DrawRoom | null>(null);
const error = ref<unknown>(null);
const canvasEl = useTemplateRef('canvasEl');
const overlayEl = useTemplateRef('overlayEl');
const overlayAlphaEl = useTemplateRef('overlayAlphaEl');
const viewportEl = useTemplateRef('viewportEl');
const chatListEl = useTemplateRef('chatListEl');
const minimapEl = useTemplateRef('minimapEl');
const engine = shallowRef<DrawCanvasEngine | null>(null);
const connection = shallowRef<Misskey.IChannelConnection<Misskey.Channels['drawRoom']> | null>(null);

// JUICE: スポイトは線を描かず、キャンバスの色を拾ってペンに戻る
const tool = ref<DrawTool | 'eyedropper'>('pen');
const color = ref('#000000');
const size = ref(6);
// 太さの上限。キャンバスの大きさに合わせて決める
const sizeMax = ref(60);
// 線の不透明度(%)。ペンなら濃さ、消しゴムなら消す強さになる
const opacity = ref(100);
const myLayerOnTop = ref(true);
const hiddenLayers = ref(new Set<string>());
// レイヤー一覧の表示順(描いたことのある人+今のメンバー)
const layerUserIds = ref<string[]>([]);
// JUICE: 今この部屋を開いている人(オンライン)。レイヤー一覧には、描いていない見学中の人もオンラインの間は出す
const onlineUserIds = ref(new Set<string>());
const listedUserIds = computed(() => [
	...layerUserIds.value,
	...[...onlineUserIds.value].filter(id => !layerUserIds.value.includes(id)),
]);
const userMap = reactive(new Map<string, Misskey.entities.UserLite>());
const chatMessages = ref<{ message: Misskey.entities.DrawRoomChatMessage; user: Misskey.entities.UserLite }[]>([]);
const chatText = ref('');
const view = reactive({ x: 0, y: 0, scale: 1 });
// 表示領域の大きさ(全体マップの枠の計算用)
const viewportSize = reactive({ width: 0, height: 0 });
// JUICE: ほかの人のカーソル(キャンバス座標)。しばらく動きが無ければ消す
const cursors = reactive(new Map<string, { x: number; y: number; updatedAt: number }>());
const CURSOR_TIMEOUT_MS = 8000;
// 自分のカーソルを送る間隔(ms)
const CURSOR_SEND_INTERVAL_MS = 60;

const isOwner = computed(() => room.value?.ownerId === $i.id);
const isFull = computed(() => room.value != null && room.value.members.length >= room.value.maxMembers);
const canDraw = computed(() => room.value != null && !room.value.isEnded && room.value.isMember);

function rememberUsers(users: Misskey.entities.UserLite[]): void {
	for (const user of users) userMap.set(user.id, user);
}

function refreshLayerList(): void {
	if (engine.value == null || room.value == null) return;
	const ids = new Set(engine.value.layerUserIds);
	for (const member of room.value.members) ids.add(member.id);
	layerUserIds.value = [...ids];
	ensureUsers(layerUserIds.value);
}

// アイコン・名前をまだ知らないユーザーの情報を取得する
const fetchingUserIds = new Set<string>();

function ensureUsers(userIds: string[]): void {
	const unknown = userIds.filter(id => !userMap.has(id) && !fetchingUserIds.has(id));
	if (unknown.length === 0) return;
	for (const id of unknown) fetchingUserIds.add(id);
	misskeyApi('users/show', { userIds: unknown }).then(users => rememberUsers(users)).finally(() => {
		for (const id of unknown) fetchingUserIds.delete(id);
	});
}

//#region 初期化・ストリーム
// JUICE: 部屋の読み込みは非同期で、読み込み中に別の部屋へ移ったり画面を離れたりすることがある。
// 古い読み込みの続きが新しい状態を上書きしないよう、世代番号が変わっていたら途中でやめる
let initGeneration = 0;
// 線の一覧を取得している間に届いた出来事は、取得した一覧で上書きされないよう、読み込み後に適用し直す
let bufferedEvents: (() => void)[] | null = null;
let wasDisconnected = false;

function applyEvent(fn: () => void): void {
	if (bufferedEvents != null) bufferedEvents.push(fn);
	else fn();
}

async function init(): Promise<void> {
	const generation = ++initGeneration;
	error.value = null;
	cancelStroke();
	disposeRoom();
	hiddenLayers.value = new Set();
	layerUserIds.value = [];
	chatMessages.value = [];
	try {
		const r = await misskeyApi('draw-rooms/show', { roomId: props.roomId });
		if (generation !== initGeneration) return;
		room.value = r;
		rememberUsers([r.owner, ...r.members]);

		const e = markRaw(new DrawCanvasEngine(r.canvasWidth, r.canvasHeight));
		const brush = brushSizeRange(r.canvasWidth, r.canvasHeight);
		// 別の大きさの部屋から移ってきたときは、その部屋に合った太さから始める
		if (brush.max !== sizeMax.value) {
			sizeMax.value = brush.max;
			size.value = brush.initial;
		}
		e.myUserId = $i.id;
		e.myLayerOnTop = myLayerOnTop.value;
		engine.value = e;
		await nextTick();
		if (generation !== initGeneration) return;
		if (canvasEl.value && overlayEl.value && overlayAlphaEl.value) e.attach(canvasEl.value, overlayEl.value, overlayAlphaEl.value);
		e.onThumbnailChange = updateMinimap;
		fitToScreen();

		await syncState(generation);
	} catch (err) {
		if (generation === initGeneration) error.value = err;
	}
}

/**
 * 線とチャットをサーバーから取り直す(初回と、ストリームの再接続時)。
 * 取りこぼさないよう先にストリームへつなぎ、取得中に届いた出来事は取得後に適用し直す
 */
async function syncState(generation: number): Promise<void> {
	const r = room.value;
	const e = engine.value;
	if (r == null || e == null) return;
	bufferedEvents = [];
	if (!r.isEnded && connection.value == null) connect();
	try {
		const [layers, chat] = await Promise.all([
			misskeyApi('draw-rooms/strokes', { roomId: r.id }),
			misskeyApi('draw-rooms/chat-history', { roomId: r.id }),
		]);
		if (generation !== initGeneration) return;
		e.load(layers.map(layer => ({ userId: layer.userId, strokes: layer.strokes.map(decodeStroke) })));
		chatMessages.value = chat;
		rememberUsers(chat.map(item => item.user));
	} finally {
		const events = bufferedEvents ?? [];
		bufferedEvents = null;
		if (generation === initGeneration) {
			for (const fn of events) fn();
		}
	}
	refreshLayerList();
	scrollChatToBottom();
}

function connect(): void {
	const c = markRaw(useStream().useChannel('drawRoom', { roomId: props.roomId }));
	connection.value = c;
	c.on('strokePart', payload => applyEvent(() => {
		// 自分の線はローカルで描いているので、自分宛てに戻ってきた分は無視する
		if (payload.userId === $i.id) return;
		engine.value?.addStrokePart(payload.userId, {
			id: payload.strokeId,
			tool: payload.tool,
			color: payload.color,
			size: payload.size,
			opacity: payload.opacity,
			points: decodePoints(payload.points),
		});
		if (!layerUserIds.value.includes(payload.userId)) refreshLayerList();
	}));
	// JUICE: カーソルはサーバーが一定間隔で全員分をまとめて送ってくる
	c.on('cursors', payload => {
		const now = Date.now();
		for (const cursor of payload.cursors) {
			if (cursor.userId === $i.id) continue;
			if (cursor.x == null || cursor.y == null) {
				cursors.delete(cursor.userId);
				continue;
			}
			cursors.set(cursor.userId, { x: cursor.x, y: cursor.y, updatedAt: now });
		}
		ensureUsers([...cursors.keys()]);
	});
	c.on('strokeCancel', payload => applyEvent(() => {
		// 自分の線が取りやめになった=サーバーが受け付けなかったので、ローカルで確定させた分も消す
		if (payload.userId === $i.id) engine.value?.removeStroke($i.id, payload.strokeId);
		else engine.value?.removePending(payload.userId, payload.strokeId);
	}));
	c.on('stroke', payload => applyEvent(() => {
		engine.value?.addStroke(payload.userId, decodeStroke(payload.stroke));
		if (!layerUserIds.value.includes(payload.userId)) refreshLayerList();
	}));
	c.on('undo', payload => applyEvent(() => {
		engine.value?.removeStroke(payload.userId, payload.strokeId);
	}));
	c.on('clearLayer', payload => applyEvent(() => {
		engine.value?.clearLayer(payload.userId);
	}));
	c.on('chat', payload => applyEvent(() => {
		if (chatMessages.value.some(item => item.message.id === payload.message.id)) return;
		rememberUsers([payload.user]);
		chatMessages.value = [...chatMessages.value, payload].slice(-100);
		scrollChatToBottom();
		// スマホでチャットを閉じているときは、ボタンに未読の印を付ける
		if (isNarrow.value && mobilePanel.value !== 'chat' && payload.user.id !== $i.id) chatUnread.value = true;
	}));
	c.on('memberJoined', payload => {
		if (room.value == null) return;
		rememberUsers([payload.user]);
		if (!room.value.members.some(m => m.id === payload.user.id)) {
			room.value = {
				...room.value,
				members: [...room.value.members, payload.user],
				isMember: room.value.isMember || payload.user.id === $i.id,
			};
		}
		refreshLayerList();
	});
	c.on('presence', payload => {
		// 裏のタブで開いた場合など、画面を見ていないのにオンラインになっていたら知らせる
		// (つないだ直後はサーバーの準備ができていないことがあるので、一覧が届いてから送る)
		if (payload.userIds.includes($i.id) && window.document.visibilityState !== 'visible') sendVisibility();
		onlineUserIds.value = new Set(payload.userIds);
		ensureUsers(payload.userIds);
	});
	c.on('memberLeft', payload => {
		if (room.value == null) return;
		room.value = {
			...room.value,
			members: room.value.members.filter(m => m.id !== payload.userId),
			isMember: payload.userId === $i.id ? false : room.value.isMember,
		};
		// 描きかけのまま抜けた人の途中の線は、続きも確定も来ないので消す
		engine.value?.clearPending(payload.userId);
		cursors.delete(payload.userId);
		if (payload.userId === $i.id) {
			cancelStroke();
			if (payload.kicked) os.toast(i18n.ts._drawRoom.kicked);
		}
		refreshLayerList();
	});
	c.on('updated', payload => {
		if (room.value == null) return;
		const resized = payload.room.canvasWidth !== room.value.canvasWidth || payload.room.canvasHeight !== room.value.canvasHeight;
		room.value = { ...payload.room, isMember: room.value.isMember, viewOnly: room.value.viewOnly };
		// JUICE: 部屋主がキャンバスの大きさを変えたら、新しい大きさで読み込み直す(描きかけの線は取りやめる)
		if (resized) {
			cancelStroke();
			init();
		}
	});
	c.on('deleted', payload => {
		cancelStroke();
		connection.value?.dispose();
		connection.value = null;
		if (deletingByMe) return;
		os.alert({ type: 'info', text: payload.byModerator ? i18n.ts._drawRoom.roomDeletedByModerator : i18n.ts._drawRoom.roomDeleted });
		router.push('/draw');
	});
	c.on('ended', payload => {
		if (room.value == null) return;
		cancelStroke();
		room.value = { ...payload.room, isMember: room.value.isMember, viewOnly: room.value.viewOnly };
		connection.value?.dispose();
		connection.value = null;
	});
}

// JUICE: 切断中に届かなかった出来事は失われるので、再接続したら線とチャットを取り直す
function onStreamDisconnected(): void {
	wasDisconnected = true;
}

// JUICE: 別のタブ・アプリに移ったら、部屋を開いている人(オンライン)から外してもらう
function sendVisibility(): void {
	connection.value?.send('visibility', { visible: window.document.visibilityState === 'visible' });
}

// タブを閉じる・別のサイトへ移るときは、ページが閉じる前に離れたことを知らせる(すぐオフラインになるように)
function onPageHide(): void {
	connection.value?.send('visibility', { visible: false });
}

function onStreamConnected(): void {
	if (!wasDisconnected) return;
	wasDisconnected = false;
	// つなぎ直した接続は「見ている」状態から始まるので、離れているなら知らせ直す
	if (window.document.visibilityState !== 'visible') sendVisibility();
	if (room.value != null && !room.value.isEnded && connection.value != null) {
		// 取り直しに失敗しても、次の再接続でまた取り直す
		syncState(initGeneration).catch(() => {});
	}
}

function disposeRoom(): void {
	cursors.clear();
	onlineUserIds.value = new Set();
	connection.value?.dispose();
	connection.value = null;
	engine.value?.dispose();
	engine.value = null;
}

function scrollChatToBottom(): void {
	nextTick(() => {
		if (chatListEl.value) chatListEl.value.scrollTop = chatListEl.value.scrollHeight;
	});
}
//#endregion

//#region 表示(拡大縮小・移動)
// 利用者が拡大縮小・移動したか(していなければ、表示領域の大きさが変わったとき画面に合わせ直す)
let viewAdjusted = false;

function fitToScreen(): void {
	viewAdjusted = false;
	if (viewportEl.value == null || room.value == null) return;
	const rect = viewportEl.value.getBoundingClientRect();
	const scale = Math.min(rect.width / room.value.canvasWidth, rect.height / room.value.canvasHeight) * 0.96;
	view.scale = scale;
	view.x = (rect.width - room.value.canvasWidth * scale) / 2;
	view.y = (rect.height - room.value.canvasHeight * scale) / 2;
}

//#region 全体マップ
const MINIMAP_UPDATE_INTERVAL_MS = 300;
const showMinimap = ref(true);

// 全体マップの大きさ(キャンバスの縦横比のまま、長い辺をTHUMBNAIL_MAX_SIZEにする)
const minimapSize = computed(() => {
	const e = engine.value;
	if (e == null) return { width: THUMBNAIL_MAX_SIZE, height: THUMBNAIL_MAX_SIZE };
	return { width: e.thumbWidth, height: e.thumbHeight };
});

// 今表示している範囲(キャンバス座標)を全体マップ上の枠にする。キャンバスの外にはみ出す分は切り取る
const minimapFrameStyle = computed(() => {
	const r = room.value;
	if (r == null || view.scale <= 0) return { display: 'none' };
	const left = Math.max(0, -view.x / view.scale);
	const top = Math.max(0, -view.y / view.scale);
	const right = Math.min(r.canvasWidth, (viewportSize.width - view.x) / view.scale);
	const bottom = Math.min(r.canvasHeight, (viewportSize.height - view.y) / view.scale);
	if (right <= left || bottom <= top) return { display: 'none' };
	return {
		left: `${(left / r.canvasWidth) * 100}%`,
		top: `${(top / r.canvasHeight) * 100}%`,
		width: `${((right - left) / r.canvasWidth) * 100}%`,
		height: `${((bottom - top) / r.canvasHeight) * 100}%`,
	};
});

// 線が続けて届いても、一定間隔でだけ描き直す
let minimapTimer: number | null = null;

function updateMinimap(): void {
	if (!showMinimap.value || minimapTimer != null) return;
	minimapTimer = window.setTimeout(() => {
		minimapTimer = null;
		if (minimapEl.value != null) engine.value?.renderThumbnail(minimapEl.value);
	}, MINIMAP_UPDATE_INTERVAL_MS);
}

watch(showMinimap, (value) => {
	if (value) updateMinimap();
});

let minimapPointerId: number | null = null;

// 全体マップ上の位置が表示の真ん中に来るよう移動する
function moveViewToMinimapPoint(ev: PointerEvent): void {
	const r = room.value;
	if (r == null) return;
	const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
	const cx = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)) * r.canvasWidth;
	const cy = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)) * r.canvasHeight;
	viewAdjusted = true;
	view.x = viewportSize.width / 2 - cx * view.scale;
	view.y = viewportSize.height / 2 - cy * view.scale;
}

function onMinimapPointerDown(ev: PointerEvent): void {
	(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
	minimapPointerId = ev.pointerId;
	moveViewToMinimapPoint(ev);
}

function onMinimapPointerMove(ev: PointerEvent): void {
	if (minimapPointerId !== ev.pointerId) return;
	moveViewToMinimapPoint(ev);
}

function onMinimapPointerUp(ev: PointerEvent): void {
	if (minimapPointerId === ev.pointerId) minimapPointerId = null;
}

// 表示領域は部屋を読み込んでから現れるので、現れたときから大きさを追う
watch(viewportEl, (el, _old, onCleanup) => {
	if (el == null) return;
	const observer = new ResizeObserver(() => {
		viewportSize.width = el.clientWidth;
		viewportSize.height = el.clientHeight;
		// 表示領域の大きさが変わったら(ウインドウ・デッキの列の大きさの変更を含む)画面に合わせ直す。
		// ただし拡大・移動していたら崩さない(スマホでキーボードが出たときに、見ていた位置がリセットされないように)
		if (!viewAdjusted) fitToScreen();
	});
	observer.observe(el);
	onCleanup(() => observer.disconnect());
});

function cancelMinimapUpdate(): void {
	if (minimapTimer != null) window.clearTimeout(minimapTimer);
	minimapTimer = null;
}
//#endregion

function zoomAt(clientX: number, clientY: number, factor: number): void {
	if (viewportEl.value == null) return;
	const rect = viewportEl.value.getBoundingClientRect();
	const px = clientX - rect.left;
	const py = clientY - rect.top;
	viewAdjusted = true;
	const next = Math.min(8, Math.max(0.1, view.scale * factor));
	const actual = next / view.scale;
	view.x = px - (px - view.x) * actual;
	view.y = py - (py - view.y) * actual;
	view.scale = next;
}

function onWheel(ev: WheelEvent): void {
	// Ctrl(ピンチ操作もCtrl付きのwheelとして届く)で拡大縮小、それ以外は移動
	if (ev.ctrlKey || ev.metaKey) {
		zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.01));
	} else {
		viewAdjusted = true;
		view.x -= ev.deltaX;
		view.y -= ev.deltaY;
	}
}
//#endregion

//#region 描く
type ActiveStroke = {
	id: string;
	tool: DrawTool;
	color: string;
	size: number;
	// 1未満のときだけ入れる(不透明な線は今までどおりのデータにする)
	opacity?: number;
	points: number[];
	// まだ送っていない点が始まる位置(points内のindex)
	sentIndex: number;
	pointerId: number;
};

let activeStroke: ActiveStroke | null = null;
let sendTimer: number | null = null;
// タッチ操作中の指(2本指での拡大縮小・移動用)
const touches = new Map<number, { x: number; y: number }>();
let pinch: { distance: number; centerX: number; centerY: number } | null = null;

function newStrokeId(): string {
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// ドラッグがキャンバスの外まで続いた場合も、サーバーが受け付ける範囲(キャンバスの少し外側まで)に収める
const CANVAS_OVERFLOW_MARGIN = 100;

// JUICE: 描いている間はキャンバスの位置を1回だけ測って使い回す。ペンの点ごとに測ると、ほかの人のカーソルの
// 表示などで画面が変わっているたびにページ全体の配置の計算が走り、描くのが遅れるため
let canvasRectCache: DOMRect | null = null;
watch(() => [view.x, view.y, view.scale], () => {
	canvasRectCache = null;
});

function canvasRect(): DOMRect {
	if (activeStroke == null) return canvasEl.value!.getBoundingClientRect();
	canvasRectCache ??= canvasEl.value!.getBoundingClientRect();
	return canvasRectCache;
}

function toCanvasPoint(ev: PointerEvent): [number, number] {
	const rect = canvasRect();
	const e = engine.value!;
	const clamp = (v: number, max: number) => Math.min(max + CANVAS_OVERFLOW_MARGIN, Math.max(-CANVAS_OVERFLOW_MARGIN, v));
	return [
		// 送る形式と同じ細かさ(1/8px)にそろえる
		Math.round(clamp(((ev.clientX - rect.left) / rect.width) * e.width, e.width) * POINT_SCALE) / POINT_SCALE,
		Math.round(clamp(((ev.clientY - rect.top) / rect.height) * e.height, e.height) * POINT_SCALE) / POINT_SCALE,
	];
}

// ペンは筆圧をそのまま使う。マウス・指は筆圧を持たないので一定の太さ(=1)にする
function pressureOf(ev: PointerEvent): number {
	if (ev.pointerType !== 'pen') return 1;
	// 送る形式(0〜255)と同じ細かさにして、自分の画面とほかの人の画面で線の太さがずれないようにする
	return Math.round(Math.min(1, Math.max(0, ev.pressure)) * 255) / 255;
}

// 今選んでいる道具で描く線の設定
function currentStrokeStyle(): Pick<ActiveStroke, 'tool' | 'color' | 'size' | 'opacity'> {
	const drawTool: DrawTool = tool.value === 'eraser' ? 'eraser' : 'pen';
	return {
		tool: drawTool,
		color: drawTool === 'eraser' ? '#000000' : color.value,
		size: size.value,
		...(opacity.value < 100 ? { opacity: opacity.value / 100 } : {}),
	};
}

function strokeStyleOf(stroke: ActiveStroke): Pick<ActiveStroke, 'tool' | 'color' | 'size' | 'opacity'> {
	return {
		tool: stroke.tool,
		color: stroke.color,
		size: stroke.size,
		...(stroke.opacity != null ? { opacity: stroke.opacity } : {}),
	};
}

function startStroke(ev: PointerEvent): void {
	canvasRectCache = null;
	const [x, y] = toCanvasPoint(ev);
	activeStroke = {
		id: newStrokeId(),
		...currentStrokeStyle(),
		points: [x, y, pressureOf(ev)],
		sentIndex: 0,
		pointerId: ev.pointerId,
	};
	showActiveStroke(0);
	scheduleSend();
}

// 描いている途中の線を自分の画面にも表示する(新しく増えた点だけを渡す)
function showActiveStroke(fromIndex: number): void {
	if (activeStroke == null || engine.value == null) return;
	engine.value.addStrokePart($i.id, {
		id: activeStroke.id,
		...strokeStyleOf(activeStroke),
		points: activeStroke.points.slice(fromIndex),
	});
}

function scheduleSend(): void {
	if (sendTimer != null) return;
	sendTimer = window.setTimeout(() => {
		sendTimer = null;
		sendStrokePart();
		if (activeStroke != null) scheduleSend();
	}, STROKE_PART_INTERVAL_MS);
}

function sendStrokePart(): void {
	if (activeStroke == null || connection.value == null) return;
	while (activeStroke.sentIndex < activeStroke.points.length) {
		const end = Math.min(activeStroke.points.length, activeStroke.sentIndex + STROKE_PART_MAX_POINTS * 3);
		connection.value.send('strokePart', {
			strokeId: activeStroke.id,
			...strokeStyleOf(activeStroke),
			points: encodePoints(activeStroke.points.slice(activeStroke.sentIndex, end)),
		});
		activeStroke.sentIndex = end;
	}
}

// 描き終わった線を確定させて送る
function finishStroke(): void {
	if (activeStroke == null) return;
	const stroke: CanvasStroke = {
		id: activeStroke.id,
		...strokeStyleOf(activeStroke),
		points: activeStroke.points,
	};
	activeStroke = null;
	if (sendTimer != null) {
		window.clearTimeout(sendTimer);
		sendTimer = null;
	}
	engine.value?.addStroke($i.id, stroke);
	connection.value?.send('stroke', { ...stroke, points: encodePoints(stroke.points) });
	if (!layerUserIds.value.includes($i.id)) refreshLayerList();
}

// 描きかけの線を取りやめる。途中までの線は皆の画面に届いているので、消してもらうよう知らせる
function cancelStroke(): void {
	if (activeStroke == null) return;
	const strokeId = activeStroke.id;
	engine.value?.removeStroke($i.id, strokeId);
	activeStroke = null;
	if (sendTimer != null) {
		window.clearTimeout(sendTimer);
		sendTimer = null;
	}
	connection.value?.send('strokeCancel', { strokeId });
}

function onPointerDown(ev: PointerEvent): void {
	if (engine.value == null) return;
	brushPanelOpen.value = false;
	if (ev.pointerType === 'touch') {
		touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
		// 2本目の指が触れたら、描きかけの線は取り消して拡大縮小・移動に切り替える
		if (touches.size >= 2) {
			cancelStroke();
			selectFrom = null;
			const [a, b] = [...touches.values()];
			pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), centerX: (a.x + b.x) / 2, centerY: (a.y + b.y) / 2 };
			return;
		}
	}
	if (selecting.value && ev.button === 0) {
		(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
		const [x, y] = canvasPointInside(ev);
		selectFrom = { x, y, pointerId: ev.pointerId };
		selection.value = null;
		return;
	}
	// 中ボタン・右ボタン、または描けない状態のドラッグは移動にする
	if (!canDraw.value || ev.button !== 0) {
		(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
		panFrom = { x: ev.clientX, y: ev.clientY, pointerId: ev.pointerId };
		return;
	}
	// スポイト(またはAltを押しながらクリック)は、その位置の色を拾ってペンにする
	if (tool.value === 'eyedropper' || ev.altKey) {
		pickColorAt(ev);
		return;
	}
	(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
	startStroke(ev);
}

function pickColorAt(ev: PointerEvent): void {
	if (engine.value == null) return;
	const [x, y] = toCanvasPoint(ev);
	const picked = engine.value.pickColor(x, y);
	if (picked == null) return;
	color.value = picked;
	tool.value = 'pen';
}

let panFrom: { x: number; y: number; pointerId: number } | null = null;

let lastCursorSentAt = 0;
let cursorShown = false;

// 自分のカーソルの位置をほかの人に送る(間引いて送る)
function sendCursor(ev: PointerEvent): void {
	if (connection.value == null || engine.value == null || room.value?.isEnded) return;
	const now = Date.now();
	if (now - lastCursorSentAt < CURSOR_SEND_INTERVAL_MS) return;
	lastCursorSentAt = now;
	const [x, y] = toCanvasPoint(ev);
	connection.value.send('cursor', { x, y });
	cursorShown = true;
}

function onPointerLeave(): void {
	if (!cursorShown || connection.value == null) return;
	cursorShown = false;
	connection.value.send('cursor', { x: null, y: null });
}

function onPointerMove(ev: PointerEvent): void {
	if (touches.size < 2) sendCursor(ev);
	if (ev.pointerType === 'touch' && touches.has(ev.pointerId)) {
		touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
		if (pinch != null && touches.size >= 2) {
			const [a, b] = [...touches.values()];
			const distance = Math.hypot(a.x - b.x, a.y - b.y);
			const centerX = (a.x + b.x) / 2;
			const centerY = (a.y + b.y) / 2;
			viewAdjusted = true;
			view.x += centerX - pinch.centerX;
			view.y += centerY - pinch.centerY;
			if (pinch.distance > 0) zoomAt(centerX, centerY, distance / pinch.distance);
			pinch = { distance, centerX, centerY };
			return;
		}
	}
	if (panFrom != null && panFrom.pointerId === ev.pointerId) {
		viewAdjusted = true;
		view.x += ev.clientX - panFrom.x;
		view.y += ev.clientY - panFrom.y;
		panFrom = { x: ev.clientX, y: ev.clientY, pointerId: ev.pointerId };
		return;
	}
	if (selectFrom != null && selectFrom.pointerId === ev.pointerId) {
		updateSelection(ev);
		return;
	}
	if (activeStroke == null || activeStroke.pointerId !== ev.pointerId) return;
	// ペンの細かい動きも取りこぼさないよう、まとめて届いた途中の点も全て使う
	const events = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [ev];
	for (const e of events.length > 0 ? events : [ev]) {
		// 長すぎる線はサーバーが受け付けないので、上限に達する前に区切り、同じ位置から新しい線として続ける
		if (activeStroke.points.length >= STROKE_MAX_POINTS * 3) splitActiveStroke();
		const fromIndex = activeStroke.points.length;
		const [x, y] = toCanvasPoint(e);
		activeStroke.points.push(x, y, pressureOf(e));
		showActiveStroke(fromIndex);
	}
}

function splitActiveStroke(): void {
	if (activeStroke == null) return;
	const lastPoint = activeStroke.points.slice(-3);
	const pointerId = activeStroke.pointerId;
	// 区切った続きの線は、元の線と同じ設定で描く
	const style = strokeStyleOf(activeStroke);
	sendStrokePart();
	finishStroke();
	activeStroke = {
		id: newStrokeId(),
		...style,
		points: lastPoint,
		sentIndex: 0,
		pointerId,
	};
	showActiveStroke(0);
	scheduleSend();
}

function onPointerUp(ev: PointerEvent): void {
	if (ev.pointerType === 'touch') {
		touches.delete(ev.pointerId);
		if (touches.size < 2) pinch = null;
	}
	if (panFrom != null && panFrom.pointerId === ev.pointerId) {
		panFrom = null;
		return;
	}
	if (selectFrom != null && selectFrom.pointerId === ev.pointerId) {
		if (ev.type !== 'pointercancel') updateSelection(ev);
		selectFrom = null;
		return;
	}
	if (activeStroke == null || activeStroke.pointerId !== ev.pointerId) return;
	if (ev.type === 'pointercancel') {
		cancelStroke();
		return;
	}
	sendStrokePart();
	finishStroke();
}

function undo(): void {
	if (!canDraw.value) return;
	connection.value?.send('undo', {});
}

async function clearMyLayer(): Promise<void> {
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._drawRoom.clearMyLayerConfirm });
	if (canceled) return;
	connection.value?.send('clearLayer', {});
}

function onKeydown(ev: KeyboardEvent): void {
	const target = ev.target;
	if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') != null)) return;
	if (ev.key === 'Escape' && selecting.value) {
		cancelSelecting();
		return;
	}
	if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
		ev.preventDefault();
		undo();
	} else if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.key.toLowerCase() === 'i' && canDraw.value) {
		tool.value = 'eyedropper';
	}
}
//#endregion

//#region レイヤー
function toggleLayer(userId: string): void {
	const hidden = new Set(hiddenLayers.value);
	if (hidden.has(userId)) hidden.delete(userId);
	else hidden.add(userId);
	hiddenLayers.value = hidden;
	engine.value?.setLayerVisible(userId, !hidden.has(userId));
}

watch(myLayerOnTop, (value) => {
	engine.value?.setMyLayerOnTop(value);
});
//#endregion

//#region 参加・部屋主の操作
async function join(): Promise<void> {
	await os.apiWithDialog('draw-rooms/join', { roomId: props.roomId });
	// JUICE: 参加できたかはサーバーの状態で確かめてから描けるようにする(サーバー側のストリームが
	// 参加を反映する前に描き始めると、その線が受け付けられないため)
	const r = await misskeyApi('draw-rooms/show', { roomId: props.roomId });
	if (room.value != null && room.value.id === r.id) room.value = r;
}

async function leave(): Promise<void> {
	cancelStroke();
	await os.apiWithDialog('draw-rooms/leave', { roomId: props.roomId });
	if (room.value != null) room.value = { ...room.value, isMember: false };
}

async function kick(userId: string): Promise<void> {
	const user = userMap.get(userId);
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx._drawRoom.kickConfirm({ name: user?.name ?? user?.username ?? userId }),
	});
	if (canceled) return;
	await os.apiWithDialog('draw-rooms/kick', { roomId: props.roomId, userId });
}

async function openRoomSettings(): Promise<void> {
	if (room.value == null) return;
	const { canceled, result } = await os.form(i18n.ts._drawRoom.roomSettings, {
		title: {
			type: 'string',
			label: i18n.ts._drawRoom.roomTitle,
			required: true,
			default: room.value.title,
		},
		maxMembers: {
			type: 'number',
			label: i18n.ts._drawRoom.maxMembers,
			description: i18n.ts._drawRoom.maxMembersCaption,
			default: room.value.maxMembers,
			step: 1,
		},
		keepAfterEnd: {
			type: 'boolean',
			label: i18n.ts._drawRoom.keepAfterEnd,
			description: i18n.ts._drawRoom.keepAfterEndCaption,
			default: room.value.keepAfterEnd,
		},
		canvasWidth: {
			type: 'number',
			label: i18n.ts._drawRoom.canvasWidth,
			description: i18n.tsx._drawRoom.canvasResizeCaption({ min: DRAW_ROOM_CANVAS_MIN_SIZE, max: Math.min(DRAW_ROOM_CANVAS_MAX_SIZE, $i.policies.drawRoomMaxCanvasSize) }),
			default: room.value.canvasWidth,
			step: 1,
		},
		canvasHeight: {
			type: 'number',
			label: i18n.ts._drawRoom.canvasHeight,
			default: room.value.canvasHeight,
			step: 1,
		},
	});
	if (canceled || !result.title || room.value == null) return;
	// ロールで決まっている上限までに収める(ただし、今の大きさのままなら上限を超えていても変えない)
	const limit = $i.policies.drawRoomMaxCanvasSize;
	const canvasWidth = result.canvasWidth === room.value.canvasWidth ? room.value.canvasWidth : clampCanvasSize(result.canvasWidth, room.value.canvasWidth, limit);
	const canvasHeight = result.canvasHeight === room.value.canvasHeight ? room.value.canvasHeight : clampCanvasSize(result.canvasHeight, room.value.canvasHeight, limit);
	// 小さくすると、はみ出した部分の線が見えなくなる(消えはしない)ので確認する
	if (canvasWidth < room.value.canvasWidth || canvasHeight < room.value.canvasHeight) {
		const { canceled: resizeCanceled } = await os.confirm({ type: 'warning', text: i18n.ts._drawRoom.canvasShrinkConfirm });
		if (resizeCanceled) return;
	}
	await os.apiWithDialog('draw-rooms/update', {
		roomId: props.roomId,
		title: result.title,
		maxMembers: clampMaxMembers(result.maxMembers, room.value.maxMembers),
		keepAfterEnd: result.keepAfterEnd,
		...(canvasWidth !== room.value.canvasWidth ? { canvasWidth } : {}),
		...(canvasHeight !== room.value.canvasHeight ? { canvasHeight } : {}),
	});
}

async function endRoom(): Promise<void> {
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._drawRoom.endRoomConfirm });
	if (canceled) return;
	await os.apiWithDialog('draw-rooms/end', { roomId: props.roomId });
}

// 自分で削除したときは、削除の知らせ(ストリーム)でダイアログを重ねて出さない
let deletingByMe = false;

// 部屋主は終了した部屋を、モデレーターは(開催中でも)問題のある部屋を削除する(モデレーターの削除はログに残る)
async function deleteRoom(confirmText: string = i18n.ts._drawRoom.deleteRoomConfirm): Promise<void> {
	const { canceled } = await os.confirm({ type: 'warning', text: confirmText });
	if (canceled) return;
	deletingByMe = true;
	try {
		await os.apiWithDialog('draw-rooms/delete', { roomId: props.roomId });
	} catch {
		deletingByMe = false;
		return;
	}
	router.push('/draw');
}

function deleteRoomAsModerator(): void {
	deleteRoom(i18n.ts._drawRoom.deleteRoomAsModeratorConfirm);
}

// JUICE: 部屋そのもの(部屋主)と、部屋のチャットの発言(発言した人)を通報する
async function openReportWindow(user: Misskey.entities.UserLite, extra: { drawRoomChatMessageId?: string }): Promise<void> {
	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkAbuseReportWindow.vue').then(x => x.default), {
		user,
		initialComment: `${url}/draw/${props.roomId}\n-----\n`,
		drawRoomId: props.roomId,
		...extra,
	}, {
		closed: () => dispose(),
	});
}

function reportRoom(): void {
	if (room.value == null) return;
	openReportWindow(room.value.owner, {});
}

function openChatMenu(ev: MouseEvent, item: { message: Misskey.entities.DrawRoomChatMessage; user: Misskey.entities.UserLite }): void {
	os.popupMenu([{
		text: i18n.ts.reportAbuse,
		icon: 'ti ti-exclamation-circle',
		danger: true,
		action: () => openReportWindow(item.user, { drawRoomChatMessageId: item.message.id }),
	}], (ev.currentTarget ?? ev.target) as HTMLElement);
}
//#endregion

//#region 完成画像
type ImageArea = { x: number; y: number; width: number; height: number };

// JUICE: 保存する画像の形式。無圧縮PNG(画素そのまま)・WebP(Misskeyのアップロード時の圧縮と同じ)・JPEG から選べる。
// 選んだ形式はこのブラウザに覚えておく
type ImageFormat = 'png' | 'webp' | 'jpeg';
const IMAGE_FORMAT_STORAGE_KEY = 'juice:drawRoom:imageFormat';
const imageFormat = ref<ImageFormat>((() => {
	try {
		const saved = window.localStorage.getItem(IMAGE_FORMAT_STORAGE_KEY);
		if (saved === 'png' || saved === 'webp' || saved === 'jpeg') return saved;
	} catch { /* 保存できない環境では毎回PNGから */ }
	return 'png';
})());
watch(imageFormat, (value) => {
	try {
		window.localStorage.setItem(IMAGE_FORMAT_STORAGE_KEY, value);
	} catch { /* 保存できなくても、この画面の間は選んだ形式を使う */ }
});
const imageFormatOptions = computed(() => [
	{ label: i18n.ts._drawRoom.formatPng, value: 'png' as const },
	{ label: i18n.ts._drawRoom.formatWebp, value: 'webp' as const },
	{ label: i18n.ts._drawRoom.formatJpeg, value: 'jpeg' as const },
]);

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Failed to export the image'))), type, quality);
	});
}

/**
 * 全体(または選んだ範囲)を、選んでいる形式の画像にする
 */
async function exportImage(area?: ImageArea | null): Promise<{ blob: Blob; ext: string } | null> {
	if (engine.value == null) return null;
	const canvas = engine.value.renderImage(area ?? undefined);
	switch (imageFormat.value) {
		case 'png': {
			const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
			return { blob: encodeUncompressedPng(image), ext: 'png' };
		}
		case 'jpeg': {
			return { blob: await canvasToBlob(canvas, 'image/jpeg', 0.92), ext: 'jpg' };
		}
		case 'webp': {
			// アップロード時の「画像の圧縮」設定の大きさまで縮小する(圧縮しない設定なら、標準の段階を使う)
			const settings = getCompressionSettings(prefer.s.defaultImageCompressionLevel === 0 ? 1 : prefer.s.defaultImageCompressionLevel);
			const webp = isWebpSupported();
			const blob = await readAndCompressImage(await canvasToBlob(canvas, 'image/png'), {
				mimeType: webp ? 'image/webp' : 'image/jpeg',
				maxWidth: settings?.maxWidth ?? canvas.width,
				maxHeight: settings?.maxHeight ?? canvas.height,
				quality: webp ? 0.85 : 0.8,
			});
			return { blob, ext: webp ? 'webp' : 'jpg' };
		}
	}
}

// 保存するたびに名前が変わるよう、部屋の名前に日時を付ける
function imageFileName(ext: string): string {
	const title = (room.value?.title ?? i18n.ts._drawRoom.title).replace(/[\\/:*?"<>|]/g, '_');
	const d = new Date();
	const pad = (n: number) => n.toString().padStart(2, '0');
	return `${title}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}

// ドライブへは作った画像をそのまま送る(アップロード時の縮小・再圧縮はしない)
async function uploadImage(area?: ImageArea | null): Promise<Misskey.entities.DriveFile | null> {
	const image = await exportImage(area);
	if (image == null) return null;
	return await uploadFile(image.blob, { name: imageFileName(image.ext) }).filePromise;
}

async function saveImageToDrive(area?: ImageArea | null): Promise<void> {
	const file = await os.promiseDialog(uploadImage(area));
	if (file == null) return;
	os.toast(i18n.ts._drawRoom.imageSaved);
	cancelSelecting();
}

async function postImage(area?: ImageArea | null): Promise<void> {
	const file = await os.promiseDialog(uploadImage(area));
	if (file == null) return;
	cancelSelecting();
	os.post({ initialFiles: [file], initialText: room.value?.title ?? '' });
}

async function downloadImage(area?: ImageArea | null): Promise<void> {
	const image = await exportImage(area);
	if (image == null) return;
	const url = URL.createObjectURL(image.blob);
	const a = window.document.createElement('a');
	a.href = url;
	a.download = imageFileName(image.ext);
	a.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
	cancelSelecting();
}

function openImageMenu(ev: MouseEvent): void {
	os.popupMenu([{
		text: i18n.ts._drawRoom.saveImage,
		icon: 'ti ti-cloud-upload',
		action: () => saveImageToDrive(),
	}, {
		text: i18n.ts._drawRoom.postImage,
		icon: 'ti ti-pencil',
		action: () => postImage(),
	}, {
		text: i18n.ts._drawRoom.downloadImage,
		icon: 'ti ti-download',
		action: () => downloadImage(),
	}, { type: 'divider' }, {
		text: i18n.ts._drawRoom.selectArea,
		icon: 'ti ti-crop',
		action: startSelecting,
	}, { type: 'divider' }, {
		type: 'radio',
		text: i18n.ts._drawRoom.imageFormat,
		icon: 'ti ti-file-type-png',
		ref: imageFormat,
		options: imageFormatOptions.value,
	}], (ev.currentTarget ?? ev.target) as HTMLElement);
}

//#region 範囲の選択
// JUICE: 選んでいる間は、キャンバスをドラッグすると描かずに範囲を選ぶ(2本指・中ボタン・右ボタンでの移動はそのまま)
const selecting = ref(false);
const selection = ref<ImageArea | null>(null);
let selectFrom: { x: number; y: number; pointerId: number } | null = null;

function startSelecting(): void {
	selecting.value = true;
	selection.value = null;
	brushPanelOpen.value = false;
	mobilePanel.value = null;
}

function cancelSelecting(): void {
	selecting.value = false;
	selection.value = null;
	selectFrom = null;
}

const selectionStyle = computed(() => {
	const r = selection.value;
	if (r == null) return {};
	return {
		transform: `translate(${view.x + r.x * view.scale}px, ${view.y + r.y * view.scale}px)`,
		width: `${r.width * view.scale}px`,
		height: `${r.height * view.scale}px`,
	};
});

function canvasPointInside(ev: PointerEvent): [number, number] {
	const e = engine.value!;
	const [x, y] = toCanvasPoint(ev);
	return [Math.min(e.width, Math.max(0, x)), Math.min(e.height, Math.max(0, y))];
}

function updateSelection(ev: PointerEvent): void {
	if (selectFrom == null) return;
	const [x, y] = canvasPointInside(ev);
	const left = Math.floor(Math.min(selectFrom.x, x));
	const top = Math.floor(Math.min(selectFrom.y, y));
	selection.value = {
		x: left,
		y: top,
		width: Math.ceil(Math.max(selectFrom.x, x)) - left,
		height: Math.ceil(Math.max(selectFrom.y, y)) - top,
	};
}
//#endregion
//#endregion

//#region チャット
function sendChat(): void {
	const text = chatText.value.trim();
	if (text.length === 0 || connection.value == null) return;
	connection.value.send('chat', { text });
	chatText.value = '';
}
//#endregion

const headerActions = computed(() => {
	const actions: { icon: string; text: string; handler: (ev: PointerEvent) => void }[] = [{
		icon: 'ti ti-arrows-minimize',
		text: i18n.ts._drawRoom.fitToScreen,
		handler: fitToScreen,
	}];
	if (isOwner.value && room.value != null && !room.value.isEnded) {
		actions.push({
			icon: 'ti ti-settings',
			text: i18n.ts._drawRoom.roomSettings,
			handler: openRoomSettings,
		}, {
			icon: 'ti ti-player-stop',
			text: i18n.ts._drawRoom.endRoom,
			handler: endRoom,
		});
	}
	// JUICE: 部屋主以外は部屋を通報できる。モデレーターは(開催中でも)部屋を削除できる
	if (!isOwner.value && room.value != null && !room.value.viewOnly) {
		actions.push({
			icon: 'ti ti-exclamation-circle',
			text: i18n.ts._drawRoom.reportRoom,
			handler: reportRoom,
		});
	}
	// 自分の部屋は、部屋主として(終了してから)削除する
	if (iAmModerator && !isOwner.value && room.value != null) {
		actions.push({
			icon: 'ti ti-trash',
			text: i18n.ts._drawRoom.deleteRoomAsModerator,
			handler: deleteRoomAsModerator,
		});
	}
	return actions;
});

watch(() => props.roomId, () => {
	room.value = null;
	init();
});

// JUICE: ページはKeepAliveでキャッシュされ、別のページへ移ってもunmountされない。離れている間に
// Ctrl+Zで裏の部屋の線が消えたり、ストリームがつながりっぱなしになったりしないよう、
// 表示されている間だけリスナーとストリームを持ち、戻ってきたら読み込み直す
let listening = false;
let deactivated = false;
let pruneTimer: number | null = null;

function startListening(): void {
	if (listening) return;
	listening = true;
	window.addEventListener('keydown', onKeydown);
	window.document.addEventListener('visibilitychange', sendVisibility);
	window.addEventListener('pagehide', onPageHide);
	useStream().on('_disconnected_', onStreamDisconnected);
	useStream().on('_connected_', onStreamConnected);
	pruneTimer = window.setInterval(() => {
		engine.value?.pruneStalePending();
		const now = Date.now();
		for (const [userId, cursor] of cursors) {
			if (now - cursor.updatedAt > CURSOR_TIMEOUT_MS) cursors.delete(userId);
		}
	}, 2000);
}

function stopListening(): void {
	if (!listening) return;
	listening = false;
	window.removeEventListener('keydown', onKeydown);
	window.document.removeEventListener('visibilitychange', sendVisibility);
	window.removeEventListener('pagehide', onPageHide);
	cancelMinimapUpdate();
	useStream().off('_disconnected_', onStreamDisconnected);
	useStream().off('_connected_', onStreamConnected);
	if (pruneTimer != null) window.clearInterval(pruneTimer);
	pruneTimer = null;
}

function leavePage(): void {
	stopListening();
	cancelStroke();
	// 離れている間に指を離した知らせが届かないと、次に来たとき1本指のドラッグを2本指の操作と取り違えるので消しておく
	touches.clear();
	pinch = null;
	panFrom = null;
	selectFrom = null;
	// Misskeyの中で別のページへ移ったときも、すぐオフラインになるよう先に知らせる
	onPageHide();
	disposeRoom();
	// 読み込み途中だった場合も、その続きを捨てる
	initGeneration++;
}

onMounted(() => {
	startListening();
	init();
});

onActivated(() => {
	startListening();
	if (deactivated) {
		deactivated = false;
		init();
	}
});

onDeactivated(() => {
	deactivated = true;
	leavePage();
});

onUnmounted(() => {
	leavePage();
});

definePage(() => ({
	title: room.value?.title ?? i18n.ts._drawRoom.title,
	icon: 'ti ti-palette',
	// キャンバスを広く使えるよう、横のウィジェット欄を出さない
	needWideArea: true,
}));
</script>

<style lang="scss" module>
.frame {
	container-type: inline-size;
	container-name: drawRoom;
}

.root {
	display: flex;
	gap: 12px;
	box-sizing: border-box;
	// ページ(デッキの列・ウインドウを含む)の表示領域いっぱいにする
	height: calc(100cqh - var(--MI-stickyTop, 0px) - var(--MI-stickyBottom, 0px));
	padding: 12px;

	// 狭いときはキャンバスを広く取り、レイヤー・チャットは下から出すパネルにする
	@container drawRoom (max-width: 800px) {
		position: relative;
		flex-direction: column;
		padding: 8px;
	}
}

.main {
	display: flex;
	flex: 1 1 0;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
	min-height: 0;

	@container drawRoom (max-width: 800px) {
		position: relative;
	}
}

.status {
	position: relative;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.statusText {
	opacity: 0.8;
}

.statusButtons {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.tools {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;
}

.brushButton {
	display: none;
	align-items: center;
	gap: 6px;
	padding: 4px 8px;
	border-radius: 6px;

	@container drawRoom (max-width: 800px) {
		display: flex;
	}
}

.brushPreview {
	width: 18px;
	height: 18px;
	border-radius: 50%;
	box-shadow: 0 0 0 1px var(--MI_THEME-divider);
}

// PCではツールバーにそのまま並べ、スマホでは押したときだけキャンバスの上に出す
.brushOptions {
	display: contents;

	@container drawRoom (max-width: 800px) {
		position: absolute;
		z-index: 10;
		top: 100%;
		left: 0;
		right: 0;
		display: none;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
		padding: 10px 12px;
		border-radius: var(--MI-radius);
		background: var(--MI_THEME-panel);
		box-shadow: 0 4px 16px var(--MI_THEME-shadow);

		> .toolSeparator {
			display: none;
		}
	}
}

.brushOptionsOpen {
	@container drawRoom (max-width: 800px) {
		display: flex;
	}
}

.statusEnd {
	display: flex;
	align-items: center;
	gap: 4px;
	margin-left: auto;
}

.selection {
	position: absolute;
	top: 0;
	left: 0;
	box-sizing: border-box;
	border: 2px dashed var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	pointer-events: none;
}

.selectionBar {
	position: absolute;
	top: 8px;
	left: 50%;
	transform: translateX(-50%);
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 4px;
	// left: 50%だと幅が表示領域の半分までに縮むので、中身の幅を取らせる(はみ出すときだけ折り返す)
	width: max-content;
	max-width: calc(100% - 16px);
	padding: 6px 8px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	box-shadow: 0 4px 16px var(--MI_THEME-shadow);
	font-size: 0.9em;
}

.selectionFormat {
	padding: 3px 6px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
	background: var(--MI_THEME-panel);
	color: inherit;
	font: inherit;
}

.selectionHint {
	padding: 0 6px;
	opacity: 0.8;
	font-variant-numeric: tabular-nums;
}

.selectionAction {
	padding: 4px 8px;
	border-radius: 6px;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.sheetButtons {
	display: none;
	gap: 4px;

	@container drawRoom (max-width: 800px) {
		display: flex;
	}

	> button {
		position: relative;
	}
}

.unreadDot {
	position: absolute;
	top: 4px;
	right: 4px;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--MI_THEME-accent);
}

.toolButton {
	padding: 6px 8px;
	border-radius: 6px;
	font-size: 1.1em;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.toolButtonActive {
	color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);
}

.toolSeparator {
	width: 1px;
	height: 20px;
	margin: 0 4px;
	background: var(--MI_THEME-divider);
}

.swatch {
	width: 20px;
	height: 20px;
	border-radius: 50%;
	border: solid 1px var(--MI_THEME-divider);
}

.swatchActive {
	outline: solid 2px var(--MI_THEME-accent);
	outline-offset: 1px;
}

.colorInput {
	width: 28px;
	height: 24px;
	padding: 0;
	border: none;
	background: none;
	cursor: pointer;
}

.sizeLabel {
	display: flex;
	align-items: center;
	gap: 4px;

	@container drawRoom (max-width: 800px) {
		flex: 1 1 200px;

		> input {
			flex: 1;
			min-width: 0;
		}
	}
}

.sizeValue {
	min-width: 2em;
	font-variant-numeric: tabular-nums;
	opacity: 0.8;
}

.viewport {
	position: relative;
	flex: 1 1 0;
	min-height: 300px;
	overflow: hidden;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-bg);
	// JUICE: 指やペンでのドラッグをブラウザのスクロール・拡大に使わせず、描画・移動に使う
	touch-action: none;
	user-select: none;

	@container drawRoom (max-width: 800px) {
		min-height: 0;
	}
}

.canvasStack {
	position: absolute;
	top: 0;
	left: 0;
	transform-origin: 0 0;
	box-shadow: 0 0 0 1px var(--MI_THEME-divider), 0 4px 16px var(--MI_THEME-shadow);
}

.canvas {
	display: block;
}

.canvasOverlay {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
}

.canvasDrawable {
	cursor: crosshair;
}

.canvasPicking {
	cursor: cell;
}

.minimap {
	position: absolute;
	right: 8px;
	bottom: 8px;
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 4px;
	// 全体マップの上では描かない(ドラッグは表示の移動に使う)
	touch-action: none;
}

.minimapBody {
	position: relative;
	overflow: hidden;
	border-radius: 6px;
	// キャンバス(白い紙)と同じ色にする
	background: #fff;
	box-shadow: 0 0 0 1px var(--MI_THEME-divider), 0 2px 8px var(--MI_THEME-shadow);
	cursor: pointer;

	// スマホでは絵を隠しすぎないよう小さくする
	@container drawRoom (max-width: 500px) {
		zoom: 0.6;
	}
}

.minimapCanvas {
	display: block;
	width: 100%;
	height: 100%;
}

.minimapFrame {
	position: absolute;
	box-sizing: border-box;
	border: 2px solid var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
	pointer-events: none;
}

.minimapBar {
	display: flex;
	gap: 4px;
}

.zoomLevel,
.minimapToggle {
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 0.8em;
	background: var(--MI_THEME-panel);
	box-shadow: 0 0 0 1px var(--MI_THEME-divider);
}

.zoomLevel {
	min-width: 3.5em;
	font-variant-numeric: tabular-nums;
}

.cursor {
	position: absolute;
	top: 0;
	left: 0;
	pointer-events: none;
	// まとめて届く間隔(0.1秒)に合わせて、次の位置までなめらかに動かす
	transition: transform 0.1s linear;
}

.cursorDot {
	position: absolute;
	top: -4px;
	left: -4px;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--MI_THEME-accent);
	box-shadow: 0 0 0 2px var(--MI_THEME-bg);
}

.cursorAvatar {
	position: absolute;
	top: 6px;
	left: 6px;
	width: 26px;
	height: 26px;
	box-shadow: 0 0 0 2px var(--MI_THEME-accent);
}

.side {
	display: flex;
	flex: 0 0 300px;
	flex-direction: column;
	gap: 12px;
	min-height: 0;

	// スマホでは下から出すパネル(開いているときだけ、選んだ方を表示)
	@container drawRoom (max-width: 800px) {
		position: absolute;
		z-index: 20;
		left: 8px;
		right: 8px;
		bottom: 8px;
		display: none;
		height: 55%;
		box-shadow: 0 -4px 24px var(--MI_THEME-shadow);
		border-radius: var(--MI-radius);
	}
}

.sideOpen {
	@container drawRoom (max-width: 800px) {
		display: flex;
	}
}

.sheetHidden {
	@container drawRoom (max-width: 800px) {
		display: none !important;
	}
}

.layers {
	@container drawRoom (max-width: 800px) {
		flex: 1 1 0;
		overflow-y: auto;
	}
}

.sheetClose {
	display: none;
	margin-left: auto;
	padding: 2px 6px;
	border-radius: 6px;

	@container drawRoom (max-width: 800px) {
		display: block;
	}
}

.sidePanel {
	padding: 10px 12px;
}

.sideHeader {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-bottom: 8px;
	font-weight: bold;
}

.memberCount {
	margin-left: auto;
	font-weight: normal;
	font-size: 0.85em;
	opacity: 0.7;
}

.memberCount + .sheetClose {
	margin-left: 4px;
}

.layerRow {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 4px 0;
}

.layerAvatarWrap {
	position: relative;
	flex-shrink: 0;
	display: flex;
}

.layerAvatar {
	width: 26px;
	height: 26px;
}

.presenceDot {
	position: absolute;
	right: -2px;
	bottom: -2px;
	width: 10px;
	height: 10px;
	box-sizing: border-box;
	border-radius: 50%;
	border: solid 2px var(--MI_THEME-panel);
	background: var(--MI_THEME-fg);
	opacity: 0.4;
}

.presenceDotOnline {
	background: var(--MI_THEME-success);
	opacity: 1;
}

.layerRowOffline {
	opacity: 0.5;
}

.onlineSummary {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-bottom: 4px;
	font-size: 0.85em;
	opacity: 0.8;
}

.onlineDotInline {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--MI_THEME-success);
}

.layerName {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ownerIcon,
.drawingIcon {
	margin-left: 4px;
	opacity: 0.7;
}

.layerButton {
	padding: 4px 6px;
	border-radius: 6px;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.layerSwitch {
	margin-top: 8px;
}

.chat {
	display: flex;
	flex: 1 1 0;
	flex-direction: column;
	min-height: 200px;

	@container drawRoom (max-width: 800px) {
		min-height: 0;
	}
}

.chatList {
	flex: 1 1 0;
	min-height: 0;
	overflow-y: auto;
}

.chatItem {
	display: flex;
	gap: 8px;
	padding: 4px 0;
}

.chatMenuButton {
	flex-shrink: 0;
	align-self: flex-start;
	margin-left: auto;
	padding: 2px 6px;
	border-radius: 6px;
	opacity: 0.5;

	&:hover,
	&:focus-visible {
		opacity: 1;
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.chatAvatar {
	flex-shrink: 0;
	width: 28px;
	height: 28px;
}

.chatBody {
	min-width: 0;
}

.chatName {
	font-size: 0.8em;
	opacity: 0.7;
}

.chatText {
	overflow-wrap: anywhere;
	white-space: pre-wrap;
}

.chatForm {
	display: flex;
	gap: 6px;
	margin-top: 8px;
}

.chatInput {
	flex: 1;
	min-width: 0;
	padding: 6px 10px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
	background: var(--MI_THEME-panel);
	color: inherit;
	font: inherit;
}

.chatSend {
	padding: 6px 10px;
	border-radius: 6px;
	color: var(--MI_THEME-accent);

	&:disabled {
		opacity: 0.4;
	}
}
</style>
