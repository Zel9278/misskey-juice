<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-mood-plus"></i></template>
	<template #label>{{ request.name }} <MkAcct :user="request.user"/></template>
	<template #suffix><MkTime :time="request.createdAt"/></template>
	<template v-if="request.status === 'pending'" #footer>
		<div class="_buttons">
			<MkButton primary @click="approve"><i class="ti ti-check" style="color: var(--MI_THEME-success)"></i> {{ i18n.ts._emojiRequestApprovals.approve }}</MkButton>
			<MkButton danger @click="reject"><i class="ti ti-x" style="color: var(--MI_THEME-error)"></i> {{ i18n.ts._emojiRequestApprovals.reject }}</MkButton>
		</div>
	</template>

	<div class="_gaps_s">
		<img v-if="request.fileUrl" :src="request.fileUrl" :class="$style.img"/>
		<div v-if="request.category">{{ i18n.ts._emojiRequestPage.category }}: {{ request.category }}</div>
		<div v-if="request.license" class="_selectable">{{ i18n.ts._emojiRequestPage.license }}: {{ request.license }}</div>
		<div v-if="request.status === 'rejected'" class="_selectable">{{ i18n.ts._emojiRequestPage.rejectReason }}: {{ request.rejectReason }}</div>
		<!-- JUICE: 審査済みの申請には「誰がいつ審査したか」を表示する -->
		<div v-if="request.reviewer">{{ i18n.ts._emojiRequestPage.reviewedBy }}: <MkAcct :user="request.reviewer"/> (<MkTime v-if="request.reviewedAt" :time="request.reviewedAt"/>)</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	request: Misskey.entities.AdminEmojiRequestsListResponse[number];
}>();

const emit = defineEmits<{
	(ev: 'resolved', requestId: string): void;
}>();

async function approve() {
	const confirm = await os.confirm({
		type: 'question',
		text: i18n.tsx._emojiRequestApprovals.approveConfirm({ name: props.request.name }),
	});
	if (confirm.canceled) return;

	os.apiWithDialog('admin/emoji-requests/approve', {
		requestId: props.request.id,
	}).then(() => {
		emit('resolved', props.request.id);
	});
}

async function reject() {
	const { canceled, result: reason } = await os.inputText({
		title: i18n.ts._emojiRequestApprovals.rejectReasonTitle,
	});
	if (canceled || !reason) return;

	os.apiWithDialog('admin/emoji-requests/reject', {
		requestId: props.request.id,
		reason,
	}).then(() => {
		emit('resolved', props.request.id);
	});
}
</script>

<style lang="scss" module>
.img {
	max-width: 100%;
	max-height: 128px;
	object-fit: contain;
}
</style>
