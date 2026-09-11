<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkWindow ref="uiWindow" :initialWidth="400" :initialHeight="560" :canResize="true" @closed="emit('closed')">
	<template #header>
		<i class="ti ti-exclamation-circle" style="margin-right: 0.5em;"></i>
		<I18n :src="i18n.ts.reportAbuseOf" tag="span">
			<template #name>
				<b><MkAcct :user="user"/></b>
			</template>
		</I18n>
	</template>
	<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
		<div class="_gaps_m" :class="$style.root">
			<div class="">
				<MkSelect v-model="category" :items="categoryOptions">
					<template #label>{{ i18n.ts._abuseUserReport.category }}</template>
				</MkSelect>
			</div>
			<div class="">
				<MkTextarea v-model="situationDetail">
					<template #label>{{ i18n.ts._abuseUserReport.situationDetail }}</template>
					<template #caption>{{ i18n.ts._abuseUserReport.situationDetailCaption }}</template>
				</MkTextarea>
			</div>
			<div class="">
				<MkTextarea v-model="comment">
					<template #label>{{ i18n.ts.details }}</template>
					<template #caption>{{ i18n.ts.fillAbuseReportDescription }}</template>
				</MkTextarea>
			</div>
			<div class="">
				<MkButton primary full :disabled="comment.length === 0" @click="send">{{ i18n.ts.send }}</MkButton>
			</div>
		</div>
	</div>
</MkWindow>
</template>

<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkWindow from '@/components/MkWindow.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { useAbuseReportCategories } from '@/composables/useAbuseReportCategories.js';

const props = defineProps<{
	user: Misskey.entities.UserLite;
	initialComment?: string;
	// JUICE: 通報対象の構造化参照(ノート/チャットメッセージのいずれか一方、省略可)
	noteId?: string;
	messageId?: string;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const uiWindow = useTemplateRef('uiWindow');
const comment = ref(props.initialComment ?? '');
// JUICE: 状況の詳細(任意、commentとは別の自由記述欄)
const situationDetail = ref('');

const { fetchCategories, getDefaultCategory, categoryOptions } = useAbuseReportCategories();
const category = ref('other');

onMounted(async () => {
	await fetchCategories();
	category.value = getDefaultCategory();
});

function send() {
	os.apiWithDialog('users/report-abuse', {
		userId: props.user.id,
		comment: comment.value,
		category: category.value,
		noteId: props.noteId,
		messageId: props.messageId,
		situationDetail: situationDetail.value.length > 0 ? situationDetail.value : undefined,
	}, undefined).then(res => {
		os.alert({
			type: 'success',
			text: i18n.ts.abuseReported,
		});
		uiWindow.value?.close();
		emit('closed');
	});
}
</script>

<style lang="scss" module>
.root {
	--root-margin: 16px;
}
</style>
