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
		<!-- JUICE: 差し替え申請(既存の絵文字の画像だけを差し替える)なら、現在の画像との比較を表示する -->
		<div v-if="request.targetEmojiId != null" :class="$style.replacementNotice">
			<span class="_juice">JUICE</span> {{ i18n.ts._emojiRequestApprovals.replacementRequest }}
			<div :class="$style.comparison">
				<div :class="$style.comparisonItem">
					<div :class="$style.comparisonLabel">{{ i18n.ts._emojiRequestApprovals.currentImage }}</div>
					<img v-if="currentTargetEmoji" :src="currentTargetEmoji.url" :class="$style.img"/>
				</div>
				<i class="ti ti-arrow-right"></i>
				<div :class="$style.comparisonItem">
					<div :class="$style.comparisonLabel">{{ i18n.ts._emojiRequestApprovals.newImage }}</div>
					<img v-if="request.fileUrl" :src="request.fileUrl" :class="$style.img"/>
				</div>
			</div>
		</div>
		<img v-else-if="request.fileUrl" :src="request.fileUrl" :class="$style.img"/>
		<div v-if="request.category">{{ i18n.ts._emojiRequestPage.category }}: {{ request.category }}</div>
		<div v-if="request.aliases.length > 0">{{ i18n.ts.tags }}: {{ request.aliases.join(' ') }}</div>
		<div v-if="request.license" class="_selectable">{{ i18n.ts._emojiRequestPage.license }}: {{ request.license }}</div>
		<div v-if="request.isSensitive">{{ i18n.ts.sensitive }}</div>
		<div v-if="request.localOnly">{{ i18n.ts.localOnly }}</div>
		<div v-if="request.status === 'rejected'" class="_selectable">{{ i18n.ts._emojiRequestPage.rejectReason }}: {{ request.rejectReason }}</div>
		<!-- JUICE: 審査済みの申請には「誰がいつ審査したか」を表示する -->
		<div v-if="request.reviewer">{{ i18n.ts._emojiRequestPage.reviewedBy }}: <MkAcct :user="request.reviewer"/><template v-if="request.reviewedAt"> (<MkTime :time="request.reviewedAt"/>)</template></div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { customEmojisMap } from '@/custom-emojis.js';

const props = defineProps<{
	request: Misskey.entities.AdminEmojiRequestsListResponse[number];
}>();

const emit = defineEmits<{
	(ev: 'resolved', requestId: string): void;
}>();

// JUICE: 差し替え申請の対象絵文字の現在の画像。IDでは引けないため、申請時点の名前(=対象絵文字の
// 名前と一致するはず)で引く。審査までの間に対象絵文字が改名されていた場合は見つからないことがある
const currentTargetEmoji = computed(() => customEmojisMap.get(props.request.name));

async function approve() {
	const confirm = await os.confirm({
		type: 'question',
		text: props.request.targetEmojiId != null
			? i18n.tsx._emojiRequestApprovals.approveReplacementConfirm({ name: props.request.name })
			: i18n.tsx._emojiRequestApprovals.approveConfirm({ name: props.request.name }),
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

.replacementNotice {
	font-size: 0.9em;
}

.comparison {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 16px;
	margin-top: 8px;
}

.comparisonItem {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
}

.comparisonLabel {
	font-size: 0.85em;
	opacity: 0.7;
}
</style>
