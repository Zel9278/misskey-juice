<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XColumn :column="column" :isStacked="isStacked" :refresher="() => reloadTimeline()">
	<template #header><i class="ti ti-star" style="margin-right: 8px;"></i>{{ column.name || i18n.ts._deck._columns.favorites }}<span class="_juice">JUICE</span></template>

	<MkPagination :paginator="paginator">
		<template #empty><MkResult type="empty" :text="i18n.ts.noNotes"/></template>

		<template #default="{ items }">
			<MkNote v-for="item in items" :key="item.id" :note="item.note" :class="$style.note"/>
		</template>
	</MkPagination>
</XColumn>
</template>

<script lang="ts" setup>
import { markRaw } from 'vue';
import XColumn from './column.vue';
import type { Column } from '@/deck.js';
import MkPagination from '@/components/MkPagination.vue';
import MkNote from '@/components/MkNote.vue';
import { i18n } from '@/i18n.js';
import { Paginator } from '@/utility/paginator.js';

defineProps<{
	column: Column;
	isStacked: boolean;
}>();

// JUICE: デッキのカラムとしてお気に入り一覧を表示できるように追加
const paginator = markRaw(new Paginator('i/favorites', {
	limit: 10,
}));

function reloadTimeline() {
	return new Promise<void>((res) => {
		paginator.reload().then(() => {
			res();
		});
	});
}
</script>

<style lang="scss" module>
.note {
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
	margin-bottom: var(--MI-margin);
}
</style>
