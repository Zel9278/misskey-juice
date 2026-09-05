<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<!-- JUICE: サムネイルで申請中の画像そのものを表示する。承認/却下後にファイルが削除されている場合はアイコンにフォールバック -->
	<template #icon>
		<img v-if="request.fileUrl" :src="request.fileUrl" :class="$style.thumbnail" alt=""/>
		<i v-else-if="request.fileId" class="ti ti-photo"></i>
	</template>
	<template #label>{{ request.name }}</template>
	<template #suffix>
		<span :class="[$style.status, $style[statusClass]]">{{ statusLabel }}</span>
	</template>

	<div class="_gaps_s">
		<!-- JUICE: 差し替え申請(既存の絵文字の画像だけを差し替える) -->
		<div v-if="request.targetEmojiId != null"><span class="_juice">JUICE</span> {{ i18n.ts._emojiRequestPage.replacementRequestBadge }}</div>
		<div v-if="request.category">{{ i18n.ts._emojiRequestPage.category }}: {{ request.category }}</div>
		<div v-if="request.aliases.length > 0">{{ i18n.ts.tags }}: {{ request.aliases.join(' ') }}</div>
		<div v-if="request.license">{{ i18n.ts._emojiRequestPage.license }}: {{ request.license }}</div>
		<div v-if="request.isSensitive">{{ i18n.ts.sensitive }}</div>
		<div v-if="request.localOnly">{{ i18n.ts.localOnly }}</div>
		<div v-if="request.status === 'rejected'" class="_selectable">
			{{ i18n.ts._emojiRequestPage.rejectReason }}: {{ request.rejectReason }}
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkFolder from '@/components/MkFolder.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	request: Misskey.entities.EmojiRequestsListResponse[number];
}>();

const statusLabel = computed(() => {
	switch (props.request.status) {
		case 'pending': return i18n.ts._emojiRequestPage.statusPending;
		case 'approved': return i18n.ts._emojiRequestPage.statusApproved;
		case 'rejected': return i18n.ts._emojiRequestPage.statusRejected;
	}
});

const statusClass = computed(() => {
	switch (props.request.status) {
		case 'pending': return 'statusPending';
		case 'approved': return 'statusApproved';
		case 'rejected': return 'statusRejected';
	}
});
</script>

<style lang="scss" module>
.thumbnail {
	display: block;
	width: 28px;
	height: 28px;
	object-fit: contain;
	border-radius: 4px;
	background: var(--MI_THEME-panel);
}

.status {
	display: inline-block;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 85%;
}

.statusPending {
	background: var(--MI_THEME-buttonBg);
}

.statusApproved {
	background: var(--MI_THEME-success);
	color: var(--MI_THEME-fgOnAccent);
}

.statusRejected {
	background: var(--MI_THEME-error);
	color: var(--MI_THEME-fgOnAccent);
}
</style>
