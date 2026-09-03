<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-user-question"></i></template>
	<template #label>{{ entry.username ? `@${entry.username}` : i18n.ts.unknown }}</template>
	<template #suffix>
		<span :class="[$style.status, $style[statusClass]]">{{ statusLabel }}</span>
	</template>

	<div class="_gaps_s">
		<div>{{ i18n.ts._juiceApprovals.reason }}</div>
		<div class="_selectable">{{ entry.signupReason ?? i18n.ts.none }}</div>
		<div v-if="entry.status === 'declined'" class="_selectable">
			{{ i18n.ts._juiceApprovals.declineReason }}: {{ entry.reason }}
		</div>
		<!-- JUICE: この機能の追加より前に処理された申請は、ユーザー名等のスナップショットを持っていない -->
		<div v-if="entry.username == null">{{ i18n.ts._juiceApprovals.historySnapshotUnavailable }}</div>
		<!-- JUICE: 審査済みの申請には「誰がいつ審査したか」を表示する -->
		<div v-if="entry.reviewer">{{ i18n.ts._juiceApprovals.reviewedBy }}: <MkAcct :user="entry.reviewer"/> (<MkTime v-if="entry.reviewedAt" :time="entry.reviewedAt"/>)</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkFolder from '@/components/MkFolder.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	entry: Misskey.entities.AdminJuiceSignupApprovalHistoryResponse[number];
}>();

const statusLabel = computed(() => {
	switch (props.entry.status) {
		case 'approved': return i18n.ts._juiceApprovals.statusApproved;
		case 'declined': return i18n.ts._juiceApprovals.statusDeclined;
	}
});

const statusClass = computed(() => {
	switch (props.entry.status) {
		case 'approved': return 'statusApproved';
		case 'declined': return 'statusDeclined';
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

.statusApproved {
	background: var(--MI_THEME-success);
	color: var(--MI_THEME-fgOnAccent);
}

.statusDeclined {
	background: var(--MI_THEME-error);
	color: var(--MI_THEME-fgOnAccent);
}
</style>
