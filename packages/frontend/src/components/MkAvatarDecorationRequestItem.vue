<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<!-- JUICE: サムネイルで申請中の画像そのものを表示する。承認/却下後にファイルが削除されている場合はアイコンにフォールバック -->
	<template #icon>
		<img v-if="request.fileUrl" :src="request.fileUrl" :class="$style.thumbnail" alt=""/>
		<i v-else-if="request.fileId" class="ti ti-sparkles"></i>
	</template>
	<template #label>{{ request.name }}</template>
	<template #suffix>
		<span :class="[$style.status, $style[statusClass]]">{{ statusLabel }}</span>
	</template>

	<div class="_gaps_s">
		<div v-if="request.description">{{ i18n.ts._avatarDecorationRequestPage.description }}: {{ request.description }}</div>
		<div v-if="request.category">{{ i18n.ts._avatarDecorationRequestPage.category }}: {{ request.category }}</div>
		<div v-if="request.status === 'rejected'" class="_selectable">
			{{ i18n.ts._avatarDecorationRequestPage.rejectReason }}: {{ request.rejectReason }}
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
	request: Misskey.entities.AvatarDecorationRequestsListResponse[number];
}>();

const statusLabel = computed(() => {
	switch (props.request.status) {
		case 'pending': return i18n.ts._avatarDecorationRequestPage.statusPending;
		case 'approved': return i18n.ts._avatarDecorationRequestPage.statusApproved;
		case 'rejected': return i18n.ts._avatarDecorationRequestPage.statusRejected;
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
