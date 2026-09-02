<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<!-- JUICE: 付けたリアクションでノートを検索する専用タブ。プライバシー上、自分自身のリアクションのみ対象 -->
	<div class="_gaps">
		<MkInfo>{{ i18n.ts._search.myReactionPageHint }}</MkInfo>

		<MkRadios v-model="myReactionMode" :options="myReactionModeOptions">
			<template #label>{{ i18n.ts._search.myReactionLabel }}<span class="_juice">JUICE</span></template>
		</MkRadios>

		<div v-if="myReactionMode === 'specific'">
			<button
				ref="myReactionPickerButtonEl"
				class="_button"
				:class="$style.myReactionPickerButton"
				@click="pickMyReaction"
			>
				<MkReactionIcon v-if="myReactionValue" :reaction="myReactionValue" :class="$style.myReactionPickerIcon"/>
				<span>{{ i18n.ts._search.selectReaction }}</span>
			</button>
		</div>

		<MkInput v-model="searchQuery" type="search" :placeholder="i18n.ts._search.narrowByKeywordPlaceholder" @enter.prevent="search">
			<template #prefix><i class="ti ti-search"></i></template>
		</MkInput>

		<div>
			<MkButton
				large
				primary
				gradate
				rounded
				:disabled="!canSearch"
				style="margin: 0 auto;"
				@click="search"
			>
				{{ i18n.ts.search }}
			</MkButton>
		</div>
	</div>

	<MkFoldableSection v-if="paginator">
		<template #header>{{ i18n.ts.searchResult }}</template>
		<MkNotesTimeline :key="`searchReactionNotes:${key}`" :paginator="paginator"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref, shallowRef, useTemplateRef } from 'vue';
import { i18n } from '@/i18n.js';
import { reactionPicker } from '@/utility/reaction-picker.js';
import MkButton from '@/components/MkButton.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import { Paginator } from '@/utility/paginator.js';
import type { MkRadiosOption } from '@/components/MkRadios.vue';

const key = ref(0);
const paginator = shallowRef<Paginator<'notes/search'> | null>(null);

const searchQuery = ref('');

const myReactionMode = ref<'any' | 'specific'>('any');
const myReactionValue = ref<string | null>(null);
const myReactionPickerButtonEl = useTemplateRef('myReactionPickerButtonEl');

const myReactionModeOptions = computed<MkRadiosOption[]>(() => [
	{ value: 'any', label: i18n.ts._search.myReactionAny, caption: i18n.ts._search.myReactionAnyCaption },
	{ value: 'specific', label: i18n.ts._search.myReactionSpecific, caption: i18n.ts._search.myReactionSpecificCaption },
]);

const canSearch = computed(() => myReactionMode.value === 'any' || myReactionValue.value != null);

function pickMyReaction() {
	reactionPicker.show(myReactionPickerButtonEl.value ?? null, null, (reaction) => {
		myReactionValue.value = reaction;
	});
}

function search() {
	if (!canSearch.value) return;

	paginator.value = markRaw(new Paginator('notes/search', {
		limit: 10,
		params: {
			query: searchQuery.value.trim(),
			myReaction: myReactionMode.value === 'any' ? 'any' : myReactionValue.value,
		},
	}));

	key.value++;
}
</script>
<style lang="scss" module>
.myReactionPickerButton {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 32px;
	padding: 0 12px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-buttonBg);
}

.myReactionPickerIcon {
	width: 20px;
	height: 20px;
}
</style>
