<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i v-if="request.fileId" class="ti ti-photo"></i></template>
	<template #label>{{ request.name }}</template>
	<template #suffix>
		<span :class="[$style.status, $style[statusClass]]">{{ statusLabel }}</span>
	</template>

	<div class="_gaps_s">
		<div v-if="request.category">{{ i18n.ts._emojiRequest.category }}: {{ request.category }}</div>
		<div v-if="request.license">{{ i18n.ts._emojiRequest.license }}: {{ request.license }}</div>
		<div v-if="request.status === 'rejected'" class="_selectable">
			{{ i18n.ts._emojiRequest.rejectReason }}: {{ request.rejectReason }}
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
		case 'pending': return i18n.ts._emojiRequest.statusPending;
		case 'approved': return i18n.ts._emojiRequest.statusApproved;
		case 'rejected': return i18n.ts._emojiRequest.statusRejected;
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
	color: #fff;
}

.statusRejected {
	background: var(--MI_THEME-error);
	color: #fff;
}
</style>
