<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<TransitionGroup
	tag="div"
	:enterActiveClass="$style.transition_items_enterActive"
	:leaveActiveClass="$style.transition_items_leaveActive"
	:enterFromClass="$style.transition_items_enterFrom"
	:leaveToClass="$style.transition_items_leaveTo"
	:moveClass="$style.transition_items_move"
	:class="[$style.items, { [$style.dragging]: dragging, [$style.horizontal]: direction === 'horizontal', [$style.vertical]: direction === 'vertical', [$style.withGaps]: withGaps, [$style.canNest]: canNest }]"
>
	<slot name="header"></slot>
	<div
		v-if="modelValue.length === 0"
		:class="$style.emptyDropArea"
		:data-mkdraggable-empty="instanceId"
	></div>
	<div
		v-for="(item, i) in modelValue"
		:key="`MkDraggableRoot:${item.id}`"
		:class="[$style.item, {
			[$style.wholeItemTrigger]: !manualDragStart,
			[$style.dropReadyForward]: dropReadyArea?.[0] === item.id && dropReadyArea?.[1] === 'forward',
			[$style.dropReadyBackward]: dropReadyArea?.[0] === item.id && dropReadyArea?.[1] === 'backward',
		}]"
		:data-mkdraggable-item="item.id"
		:data-mkdraggable-instance="instanceId"
		@pointerdown="!manualDragStart && onItemPointerDown($event, item)"
	>
		<div :key="`MkDraggableItem:${item.id}`" style="position: relative; z-index: 0;">
			<slot :item="item" :index="i" :dragStart="(ev: PointerEvent) => onHandlePointerDown(ev, item)"></slot>
		</div>
	</div>
	<slot name="footer"></slot>
</TransitionGroup>
</template>

<script lang="ts">
import { ref } from 'vue';

// JUICE: 従来のHTML5 Drag and Drop APIはタッチ操作にネイティブ対応しておらず、
// スマートフォン等では並べ替えがまともに機能しなかったため、Pointer Events
// ベースの独自実装に置き換えている。別々のコンポーネントインスタンス間で
// D&Dを融通する(groupが一致する場合)ため、以下の状態はモジュールスコープで
// グローバルに持つ必要がある
const dragging = ref(false);
const dropReadyArea = ref<[itemId: string, position: 'forward' | 'backward'] | null>(null);

type InstanceHandle<T extends { id: string }> = {
	group: string;
	applyDrop: (draggedItem: T, targetItemId: string | null, backward: boolean, fromSameInstance: boolean) => void;
	removeItem: (itemId: string) => void;
};
const instances = new Map<string, InstanceHandle<any>>();

type ActiveDrag<T extends { id: string }> = {
	item: T;
	group: string;
	instanceId: string;
	pointerId: number;
};
let activeDrag: ActiveDrag<any> | null = null;
let hoverInstanceId: string | null = null;

// JUICE: 通常のクリック・タップとドラッグを区別するための移動量の閾値
const MOVE_CANCEL_THRESHOLD = 8;

// JUICE: 縦並び・ハンドル無しはドラッグの軸とスクロールの軸が同じで、
// touch-actionによる住み分けができない。長押しで明確な意図を確認してから
// ドラッグを開始し、長押し確定前に動いた場合はスクロールとみなして
// 自前でスクロールさせる(touch-action: noneでネイティブの横取りを防いでいるため)
const TOUCH_LONG_PRESS_MS = 200;

function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
	let node: HTMLElement | null = el.parentElement;
	while (node != null) {
		const overflowY = window.getComputedStyle(node).overflowY;
		if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
			return node;
		}
		node = node.parentElement;
	}
	return window.document.scrollingElement as HTMLElement | null;
}
</script>

<script lang="ts" setup generic="T extends { id: string }">
import { onUnmounted } from 'vue';
import { genId } from '@/utility/id.js';

const slots = defineSlots<{
	default(props: { item: T; index: number; dragStart: (ev: PointerEvent) => void }): any;
	header(): any;
	footer(): any;
}>();

const props = withDefaults(defineProps<{
	modelValue: T[];
	direction: 'horizontal' | 'vertical';
	group?: string | null;
	manualDragStart?: boolean;
	withGaps?: boolean;
	canNest?: boolean;
}>(), {
	group: null,
	manualDragStart: false,
	withGaps: false,
	canNest: false,
});

const emit = defineEmits<{
	(ev: 'update:modelValue', value: T[]): void;
}>();

const instanceId = genId();
const group = props.group ?? instanceId;

instances.set(instanceId, {
	group,
	applyDrop(draggedItem: T, targetItemId: string | null, backward: boolean, fromSameInstance: boolean) {
		let newValue = fromSameInstance
			? props.modelValue.filter(x => x.id !== draggedItem.id)
			: [...props.modelValue];

		if (targetItemId == null) {
			// 空リストへのドロップ
			newValue = [draggedItem as T];
		} else {
			let toIndex = newValue.findIndex(x => x.id === targetItemId);
			if (toIndex === -1) return;
			if (backward) toIndex += 1;
			newValue.splice(toIndex, 0, draggedItem as T);
		}

		emit('update:modelValue', newValue);
	},
	removeItem(itemId: string) {
		emit('update:modelValue', props.modelValue.filter(x => x.id !== itemId));
	},
});

onUnmounted(() => {
	instances.delete(instanceId);
});

function isPrimaryTrigger(ev: PointerEvent): boolean {
	if (ev.pointerType === 'mouse' && ev.button !== 0) return false;
	return true;
}

/** JUICE: ハンドル経由(manualDragStart)の場合、明確な意図があるため即座にドラッグを開始する */
function onHandlePointerDown(ev: PointerEvent, item: T) {
	if (!isPrimaryTrigger(ev)) return;
	if (activeDrag != null) return;
	ev.preventDefault();
	beginDrag(ev.currentTarget as HTMLElement, ev.pointerId, item, ev.clientX, ev.clientY);
}

/** JUICE: アイテム全体がトリガーの場合、通常のクリック・スクロール操作と区別してから開始する */
function onItemPointerDown(ev: PointerEvent, item: T) {
	if (!isPrimaryTrigger(ev)) return;
	if (activeDrag != null) return;

	const startX = ev.clientX;
	const startY = ev.clientY;
	const pointerId = ev.pointerId;
	const currentTarget = ev.currentTarget as HTMLElement;
	const isTouch = ev.pointerType !== 'mouse';
	// JUICE: 縦並び・ハンドル無しはドラッグ軸とスクロール軸が同じで、touch-actionでの
	// 住み分けができない。長押しで意図を確認してから開始し、それまでに動いた場合は
	// 自前でスクロールを代行する(touch-action: noneでネイティブの横取りを防いでいるため)
	const requiresLongPress = isTouch && props.direction === 'vertical';
	let settled = false;
	let manualScrolling = false;
	let lastY = startY;
	let scrollContainer: HTMLElement | null = null;

	const cleanup = () => {
		window.removeEventListener('pointermove', onPendingMove);
		window.removeEventListener('pointerup', onPendingUp);
		window.removeEventListener('pointercancel', onPendingUp);
	};
	const onPendingMove = (mv: PointerEvent) => {
		if (mv.pointerId !== pointerId || settled) return;
		const dx = mv.clientX - startX;
		const dy = mv.clientY - startY;

		if (requiresLongPress) {
			if (manualScrolling) {
				scrollContainer ??= findScrollableAncestor(currentTarget);
				scrollContainer?.scrollBy(0, lastY - mv.clientY);
				lastY = mv.clientY;
				return;
			}
			if (Math.hypot(dx, dy) > MOVE_CANCEL_THRESHOLD) {
				// 長押し確定前に動いた場合、ドラッグは諦めて手動スクロールに切り替える
				manualScrolling = true;
				lastY = mv.clientY;
			}
			return;
		}

		// JUICE: 横並び(touch-action: pan-y)は、縦方向優位の移動はネイティブの
		// 縦スクロールに譲る。横方向優位の移動だけをドラッグ開始とみなす
		if (isTouch && props.direction === 'horizontal' && Math.abs(dy) > MOVE_CANCEL_THRESHOLD && Math.abs(dy) >= Math.abs(dx)) {
			settled = true;
			cleanup();
			return;
		}
		if (Math.hypot(dx, dy) <= MOVE_CANCEL_THRESHOLD) return;

		settled = true;
		cleanup();
		beginDrag(currentTarget, pointerId, item, mv.clientX, mv.clientY);
	};
	const onPendingUp = () => {
		if (settled) return;
		settled = true;
		cleanup();
	};

	window.addEventListener('pointermove', onPendingMove);
	window.addEventListener('pointerup', onPendingUp);
	window.addEventListener('pointercancel', onPendingUp);

	if (requiresLongPress) {
		window.setTimeout(() => {
			if (settled || manualScrolling) return;
			settled = true;
			cleanup();
			beginDrag(currentTarget, pointerId, item, startX, startY);
		}, TOUCH_LONG_PRESS_MS);
	}
}

function beginDrag(target: HTMLElement, pointerId: number, item: T, clientX: number, clientY: number) {
	try {
		target.setPointerCapture(pointerId);
	} catch {
		// 一部の環境ではsetPointerCaptureが失敗することがあるが、
		// windowへのフォールバックリスナーで動作は継続できるため無視する
	}

	activeDrag = { item, group, instanceId, pointerId };
	hoverInstanceId = null;
	dropReadyArea.value = null;
	dragging.value = true;

	window.addEventListener('pointermove', onDragMove);
	window.addEventListener('pointerup', onDragEnd);
	window.addEventListener('pointercancel', onDragEnd);

	// JUICE: 合成イベントによっては開始後にpointermoveが1回も来ないまま
	// pointerupへ進むことがあるため、開始した時点の座標で一度だけ当たり判定しておく
	updateDropTarget(clientX, clientY);
}

function onDragMove(ev: PointerEvent) {
	if (activeDrag == null || ev.pointerId !== activeDrag.pointerId) return;
	ev.preventDefault();
	updateDropTarget(ev.clientX, ev.clientY);
}

function updateDropTarget(clientX: number, clientY: number) {
	if (activeDrag == null) return;

	const el = window.document.elementFromPoint(clientX, clientY);
	const emptyEl = el?.closest<HTMLElement>('[data-mkdraggable-empty]');
	if (emptyEl != null) {
		hoverInstanceId = emptyEl.dataset.mkdraggableEmpty ?? null;
		dropReadyArea.value = null;
		return;
	}

	const itemEl = el?.closest<HTMLElement>('[data-mkdraggable-item]');
	if (itemEl == null) {
		hoverInstanceId = null;
		dropReadyArea.value = null;
		return;
	}

	const targetItemId = itemEl.dataset.mkdraggableItem!;
	if (targetItemId === activeDrag.item.id) {
		hoverInstanceId = null;
		dropReadyArea.value = null;
		return;
	}

	hoverInstanceId = itemEl.dataset.mkdraggableInstance ?? null;
	const rect = itemEl.getBoundingClientRect();
	const backward = props.direction === 'horizontal'
		? (clientX - rect.left) > rect.width / 2
		: (clientY - rect.top) > rect.height / 2;
	dropReadyArea.value = [targetItemId, backward ? 'backward' : 'forward'];
}

function onDragEnd(ev: PointerEvent) {
	if (activeDrag == null || ev.pointerId !== activeDrag.pointerId) return;

	window.removeEventListener('pointermove', onDragMove);
	window.removeEventListener('pointerup', onDragEnd);
	window.removeEventListener('pointercancel', onDragEnd);

	const dragged = activeDrag;
	const drop = dropReadyArea.value;
	const targetInstanceId = hoverInstanceId;

	activeDrag = null;
	hoverInstanceId = null;
	dropReadyArea.value = null;
	dragging.value = false;

	if (targetInstanceId == null) return;
	const targetHandle = instances.get(targetInstanceId);
	if (targetHandle == null || targetHandle.group !== dragged.group) return;

	const fromSameInstance = targetInstanceId === dragged.instanceId;
	targetHandle.applyDrop(dragged.item, drop?.[0] ?? null, drop?.[1] === 'backward', fromSameInstance);

	if (!fromSameInstance) {
		instances.get(dragged.instanceId)?.removeItem(dragged.item.id);
	}
}

defineExpose({});
</script>

<style lang="scss" module>
.transition_items_move,
.transition_items_enterActive,
.transition_items_leaveActive {
	transition: all 0.15s ease;
}
.transition_items_enterFrom,
.transition_items_leaveTo {
	opacity: 0;
}
.transition_items_leaveActive {
	position: absolute;
}

.items {
	display: flex;
	align-items: center;
	justify-content: left;
	flex-wrap: wrap;
}

.items.horizontal {
	flex-direction: row;
}
.items.vertical {
	flex-direction: column;
}

.item {
	position: relative;
	// JUICE: 長押し判定の途中でネイティブのテキスト選択・コールアウトメニューに
	// ジェスチャーを奪われないようにする(奪われるとpointerイベントが打ち切られ、
	// ドラッグ開始判定が固まったまま戻らなくなる)
	user-select: none;
	-webkit-user-select: none;
	-webkit-touch-callout: none;
}

.items.horizontal .wholeItemTrigger {
	// JUICE: 横並びの場合、ドラッグ操作の軸(横)とページスクロールの軸(縦)が
	// 直交するため、縦方向のネイティブパンだけは常に許可しておく
	touch-action: pan-y;
}

.items.vertical .wholeItemTrigger {
	// JUICE: 縦並び・ハンドル無しの場合、ドラッグの軸とスクロールの軸が同じで
	// 安全に共存させる方法が無いため、アイテム上ではドラッグ操作を優先する
	// (このアイテム上ではネイティブスクロールを行わない。スクロールしたい場合は
	// アイテム以外の領域から操作する想定)
	touch-action: none;
}

.items.vertical .item {
	width: 100%;
}

.items.horizontal.withGaps {
	row-gap: var(--MI-margin);
}

.items.horizontal.withGaps .item {
	padding-left: calc(var(--MI-margin) / 2);
	padding-right: calc(var(--MI-margin) / 2);
}

.items.vertical.withGaps .item {
	padding-top: calc(var(--MI-margin) / 2);
	padding-bottom: calc(var(--MI-margin) / 2);
}

.dropReadyForward::before, .dropReadyBackward::before {
	content: '';
	position: absolute;
	z-index: 99999;
	background: var(--MI_THEME-accent);
	border-radius: 999px;
	pointer-events: none;
}

.items.horizontal {
	.dropReadyForward::before {
		top: 0;
		left: -1px;
		width: 2px;
		height: 100%;
	}

	.dropReadyBackward::before {
		top: 0;
		right: -1px;
		width: 2px;
		height: 100%;
	}
}

.items.vertical {
	.dropReadyForward::before {
		top: -1px;
		left: 0;
		width: 100%;
		height: 2px;
	}

	.dropReadyBackward::before {
		bottom: -1px;
		left: 0;
		width: 100%;
		height: 2px;
	}
}

.items.horizontal .emptyDropArea {
	width: 40px;
	height: 40px;
}

.items.vertical .emptyDropArea {
	width: 100%;
	height: 50px;
}
</style>
