<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-user-question"></i></template>
	<template #label>@{{ signup.username }}{{ signup.host ? `@${signup.host}` : '' }}</template>
	<template #suffix><MkTime :time="signup.createdAt"/></template>
	<template #footer>
		<div class="_buttons">
			<MkButton primary @click="approve"><i class="ti ti-check" style="color: var(--MI_THEME-success)"></i> {{ i18n.ts._juiceApprovals.approve }}</MkButton>
			<MkButton danger @click="decline"><i class="ti ti-x" style="color: var(--MI_THEME-error)"></i> {{ i18n.ts._juiceApprovals.decline }}</MkButton>
		</div>
	</template>

	<div class="_gaps_s">
		<div>{{ i18n.ts._juiceApprovals.reason }}</div>
		<div class="_selectable">{{ signup.signupReason ?? i18n.ts.none }}</div>
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
	signup: Misskey.entities.AdminJuicePendingSignupsResponse[number];
}>();

const emit = defineEmits<{
	(ev: 'resolved', userId: string): void;
}>();

async function approve() {
	const confirm = await os.confirm({
		type: 'question',
		text: i18n.tsx._juiceApprovals.approveConfirm({ username: props.signup.username }),
	});
	if (confirm.canceled) return;

	os.apiWithDialog('admin/juice/approve-signup', {
		userId: props.signup.id,
	}).then(() => {
		emit('resolved', props.signup.id);
	});
}

async function decline() {
	// JUICE: 却下するとアカウントが削除される(取り消せない)ため、理由入力と一緒に警告文も表示する
	const { canceled, result: reason } = await os.inputText({
		title: i18n.ts._juiceApprovals.declineReasonTitle,
		text: i18n.tsx._juiceApprovals.declineWarning({ username: props.signup.username }),
	});
	if (canceled || !reason) return;

	os.apiWithDialog('admin/juice/decline-signup', {
		userId: props.signup.id,
		reason,
	}).then(() => {
		emit('resolved', props.signup.id);
	});
}
</script>
