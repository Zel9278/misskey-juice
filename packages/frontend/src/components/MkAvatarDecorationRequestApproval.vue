<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-sparkles"></i></template>
	<template #label>{{ request.name }} <MkAcct :user="request.user"/></template>
	<template #suffix><MkTime :time="request.createdAt"/></template>
	<template v-if="request.status === 'pending'" #footer>
		<div class="_buttons">
			<MkButton primary @click="approve"><i class="ti ti-check" style="color: var(--MI_THEME-success)"></i> {{ i18n.ts._avatarDecorationRequestApprovals.approve }}</MkButton>
			<MkButton danger @click="reject"><i class="ti ti-x" style="color: var(--MI_THEME-error)"></i> {{ i18n.ts._avatarDecorationRequestApprovals.reject }}</MkButton>
		</div>
	</template>

	<div class="_gaps_s">
		<!-- JUICE: 差し替え申請(既存のデコレーションの画像だけを差し替える)なら、現在の画像との比較を表示する -->
		<div v-if="request.targetAvatarDecorationId != null" :class="$style.replacementNotice">
			<span class="_juice">JUICE</span> {{ i18n.ts._avatarDecorationRequestApprovals.replacementRequest }}
			<div :class="$style.comparison">
				<div :class="$style.comparisonItem">
					<div :class="$style.comparisonLabel">{{ i18n.ts._avatarDecorationRequestApprovals.currentImage }}</div>
					<img v-if="currentTargetDecoration" :src="currentTargetDecoration.url" :class="$style.comparisonImg"/>
				</div>
				<i class="ti ti-arrow-right"></i>
				<div :class="$style.comparisonItem">
					<div :class="$style.comparisonLabel">{{ i18n.ts._avatarDecorationRequestApprovals.newImage }}</div>
					<img v-if="request.fileUrl" :src="request.fileUrl" :class="$style.comparisonImg"/>
				</div>
			</div>
		</div>
		<div v-if="request.fileUrl" :class="$style.preview">
			<div :class="$style.previewLabel">{{ i18n.ts._avatarDecorationRequestPage.preview }}</div>
			<div :class="$style.previewSwatches">
				<div :class="[$style.previewSwatch, $style.light]">
					<MkAvatar :class="$style.previewAvatar" :user="request.user" :decorations="[decorationForPreview]" forceShowDecoration/>
				</div>
				<div :class="[$style.previewSwatch, $style.dark]">
					<MkAvatar :class="$style.previewAvatar" :user="request.user" :decorations="[decorationForPreview]" forceShowDecoration/>
				</div>
			</div>
			<!-- JUICE: 装着ダイアログ(settings/avatar-decoration.dialog.vue)と同じ角度・位置・反転の調整UI。
				審査時に回転・反転した見た目も確認できるようにする -->
			<div class="_gaps_s" :class="$style.previewControls">
				<MkRange v-model="previewAngle" continuousUpdate :min="-0.5" :max="0.5" :step="0.025" :textConverter="(v) => `${Math.floor(v * 360)}°`">
					<template #label>{{ i18n.ts.angle }}</template>
				</MkRange>
				<MkRange v-model="previewOffsetX" continuousUpdate :min="-0.25" :max="0.25" :step="0.025" :textConverter="(v) => `${Math.floor(v * 100)}%`">
					<template #label>X {{ i18n.ts.position }}</template>
				</MkRange>
				<MkRange v-model="previewOffsetY" continuousUpdate :min="-0.25" :max="0.25" :step="0.025" :textConverter="(v) => `${Math.floor(v * 100)}%`">
					<template #label>Y {{ i18n.ts.position }}</template>
				</MkRange>
				<MkSwitch v-model="previewFlipH">
					<template #label>{{ i18n.ts.flip }}</template>
				</MkSwitch>
			</div>
		</div>
		<div v-if="request.description">{{ i18n.ts._avatarDecorationRequestPage.description }}: {{ request.description }}</div>
		<div v-if="request.category">{{ i18n.ts._avatarDecorationRequestPage.category }}: {{ request.category }}</div>
		<div v-if="request.status === 'rejected'" class="_selectable">{{ i18n.ts._avatarDecorationRequestPage.rejectReason }}: {{ request.rejectReason }}</div>
		<!-- JUICE: 審査済みの申請には「誰がいつ審査したか」を表示する -->
		<div v-if="request.reviewer">{{ i18n.ts._avatarDecorationRequestPage.reviewedBy }}: <MkAcct :user="request.reviewer"/><template v-if="request.reviewedAt"> (<MkTime :time="request.reviewedAt"/>)</template></div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkRange from '@/components/MkRange.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{
	request: Misskey.entities.AdminAvatarDecorationRequestsListResponse[number];
}>();

const emit = defineEmits<{
	(ev: 'resolved', requestId: string): void;
}>();

// JUICE: 審査時のプレビュー確認用。承認/却下の判断材料であり、送信するデータには含めない
const previewAngle = ref(0);
const previewOffsetX = ref(0);
const previewOffsetY = ref(0);
const previewFlipH = ref(false);
const decorationForPreview = computed(() => ({
	url: props.request.fileUrl ?? '',
	angle: previewAngle.value,
	flipH: previewFlipH.value,
	offsetX: previewOffsetX.value,
	offsetY: previewOffsetY.value,
}));

// JUICE: 差し替え申請の対象デコレーションの現在の画像。IDで引ける
const currentTargetDecoration = ref<Misskey.entities.GetAvatarDecorationsResponse[number] | null>(null);
if (props.request.targetAvatarDecorationId != null) {
	misskeyApi('get-avatar-decorations').then(decorations => {
		currentTargetDecoration.value = decorations.find(d => d.id === props.request.targetAvatarDecorationId) ?? null;
	}).catch(() => {
		// 取得に失敗しても審査自体は続行できるようにする(「現在の画像」欄が空のまま表示されるだけ)
	});
}

async function approve() {
	const confirm = await os.confirm({
		type: 'question',
		text: props.request.targetAvatarDecorationId != null
			? i18n.tsx._avatarDecorationRequestApprovals.approveReplacementConfirm({ name: props.request.name })
			: i18n.tsx._avatarDecorationRequestApprovals.approveConfirm({ name: props.request.name }),
	});
	if (confirm.canceled) return;

	os.apiWithDialog('admin/avatar-decoration-requests/approve', {
		requestId: props.request.id,
	}).then(() => {
		emit('resolved', props.request.id);
	});
}

async function reject() {
	const { canceled, result: reason } = await os.inputText({
		title: i18n.ts._avatarDecorationRequestApprovals.rejectReasonTitle,
	});
	if (canceled || !reason) return;

	os.apiWithDialog('admin/avatar-decoration-requests/reject', {
		requestId: props.request.id,
		reason,
	}).then(() => {
		emit('resolved', props.request.id);
	});
}
</script>

<style lang="scss" module>
.preview {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.previewLabel {
	font-size: 0.85em;
	opacity: 0.7;
	text-align: center;
}

.previewSwatches {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
}

.previewSwatch {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 100px;
	border-radius: var(--MI-radius);

	&.light {
		background: #eee;
	}

	&.dark {
		background: #222;
	}
}

.previewAvatar {
	width: 80px;
	height: 80px;
}

.previewControls {
	max-width: 320px;
	margin: 0 auto;
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

.comparisonImg {
	max-width: 100%;
	max-height: 80px;
	object-fit: contain;
}
</style>
