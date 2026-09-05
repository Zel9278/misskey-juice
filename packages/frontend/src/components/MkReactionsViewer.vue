<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component
	:is="prefer.s.animation ? TransitionGroup : 'div'"
	:enterActiveClass="$style.transition_x_enterActive"
	:leaveActiveClass="$style.transition_x_leaveActive"
	:enterFromClass="$style.transition_x_enterFrom"
	:leaveToClass="$style.transition_x_leaveTo"
	:moveClass="$style.transition_x_move"
	tag="div" :class="$style.root"
>
	<XReaction
		v-for="[reaction, count] in _reactions"
		:key="reaction"
		:reaction="reaction"
		:reactionEmojis="props.reactionEmojis"
		:count="count"
		:isInitial="initialReactions.has(reaction)"
		:note="props.note"
		:noteId="props.noteId"
		:myReaction="props.myReaction"
		@reactionToggled="onMockToggleReaction"
	/>
	<slot v-if="hasMoreReactions" name="more"></slot>
</component>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed, inject, watch, ref } from 'vue';
import { TransitionGroup } from 'vue';
import { getUnicodeEmojiOrNull } from '@@/js/emojilist.js';
import XReaction from '@/components/MkReactionsViewer.reaction.vue';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';
import { customEmojisMap } from '@/custom-emojis.js';
import { DI } from '@/di.js';
import { checkReactionPermissions } from '@/utility/check-reaction-permissions.js';
import { juicePublicSettingsCache } from '@/cache.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	noteId: Misskey.entities.Note['id'];
	reactions: Misskey.entities.Note['reactions'];
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReaction: Misskey.entities.Note['myReaction'];
	maxNumber?: number;
}>(), {
	maxNumber: Infinity,
});

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'mockUpdateMyReaction', emoji: string, delta: number): void;
}>();

const initialReactions = new Set(Object.keys(props.reactions));

const _reactions = ref<[string, number][]>([]);
const hasMoreReactions = ref(false);

if (props.myReaction != null && !(props.myReaction in props.reactions)) {
	_reactions.value.push([props.myReaction, props.reactions[props.myReaction]]);
}

function onMockToggleReaction(emoji: string, count: number) {
	if (!mock) return;

	const i = _reactions.value.findIndex((item) => item[0] === emoji);
	if (i < 0) return;

	emit('mockUpdateMyReaction', emoji, (count - _reactions.value[i][1]));
}

// JUICE: リモートのカスタム絵文字を使ったリアクションへの相乗りが管理者設定で有効化されているか。
// MkReactionsViewer.reaction.vueのcanToggleと同じ設定を参照し、「利用可能」表示と実際にクリック
// できるかどうかの判定を一致させる
const reactionPiggybackOnRemoteEnabled = computed(() => juicePublicSettingsCache.value.value?.reactionPiggybackOnRemoteEnabled ?? false);

// JUICE: MkReactionsViewer.reaction.vueのcanToggleと同じロジックで判定する。以前はロール制限・
// センシティブ・ローカル限定を無視しており、実際にはクリックできない(権限が無い)リアクションが
// 「利用可能」として先頭に表示されうる不整合があった
function canReact(reaction: string): boolean {
	if (!$i) return false;

	const isLocalReactionFormat = reaction.match(/@\w/) == null;
	if (!isLocalReactionFormat) {
		return reactionPiggybackOnRemoteEnabled.value;
	}

	const emojiName = reaction.replace(/:/g, '').replace(/@\./, '');
	const emoji = customEmojisMap.get(emojiName) ?? getUnicodeEmojiOrNull(reaction);
	if (emoji == null) return false;
	return checkReactionPermissions($i, props.note, emoji);
}

watch([() => props.reactions, () => props.maxNumber], ([newSource, maxNumber]) => {
	let newReactions: [string, number][] = [];
	hasMoreReactions.value = Object.keys(newSource).length > maxNumber;

	for (let i = 0; i < _reactions.value.length; i++) {
		const reaction = _reactions.value[i][0];
		if (reaction in newSource && newSource[reaction] !== 0) {
			_reactions.value[i][1] = newSource[reaction];
			newReactions.push(_reactions.value[i]);
		}
	}

	const newReactionsNames = newReactions.map(([x]) => x);
	newReactions = [
		...newReactions,
		...Object.entries(newSource)
			.sort(([emojiA, countA], [emojiB, countB]) => {
				if (prefer.s.showAvailableReactionsFirstInNote) {
					if (!canReact(emojiA) && canReact(emojiB)) return 1;
					if (canReact(emojiA) && !canReact(emojiB)) return -1;
					return countB - countA;
				} else {
					return countB - countA;
				}
			})
			.filter(([y], i) => i < maxNumber && !newReactionsNames.includes(y)),
	];

	newReactions = newReactions.slice(0, props.maxNumber);

	if (props.myReaction && !newReactions.map(([x]) => x).includes(props.myReaction)) {
		newReactions.push([props.myReaction, newSource[props.myReaction]]);
	}

	_reactions.value = newReactions;
}, { immediate: true, deep: true });
</script>

<style lang="scss" module>
.transition_x_move,
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	opacity: 0;
	transform: scale(0.7);
}
.transition_x_leaveActive {
	position: absolute;
}

.root {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;

	&:empty {
		display: none;
	}
}
</style>
