<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<MkInfo v-if="!enabled">{{ i18n.ts._avatarDecorationRequestPage.disabled }}</MkInfo>
		<template v-else>
			<div v-if="tab === 'form'" class="_gaps_m">
				<MkButton rounded style="margin: 0 auto;" @click="chooseFile">{{ i18n.ts.selectFile }}</MkButton>
				<!-- JUICE: 複数の画像をまとめて選択すると、同じ画面から複数件をまとめて申請できる -->
				<MkInfo v-if="drafts.length === 0">{{ i18n.ts._avatarDecorationRequestPage.multipleRequestsHint }}</MkInfo>

				<div v-for="(draft, i) in drafts" :key="draft.key" class="_gaps_s" :class="$style.draftCard">
					<div v-if="drafts.length > 1" :class="$style.draftHeader">
						<span>{{ i18n.tsx._avatarDecorationRequestPage.requestNumber({ n: i + 1 }) }}</span>
						<button class="_button" :class="$style.draftRemoveButton" @click="removeDraft(draft.key)">
							<i class="ti ti-x"></i>
						</button>
					</div>

					<div :class="$style.preview">
						<div :class="$style.previewLabel">{{ i18n.ts._avatarDecorationRequestPage.preview }}</div>
						<div :class="$style.previewSwatches">
							<div :class="[$style.previewSwatch, $style.light]">
								<MkAvatar :class="$style.previewAvatar" :user="$i" :decorations="[decorationForPreview(draft)]" forceShowDecoration/>
							</div>
							<div :class="[$style.previewSwatch, $style.dark]">
								<MkAvatar :class="$style.previewAvatar" :user="$i" :decorations="[decorationForPreview(draft)]" forceShowDecoration/>
							</div>
						</div>
						<!-- JUICE: 装着ダイアログ(settings/avatar-decoration.dialog.vue)と同じ角度・位置・反転の調整UI -->
						<div class="_gaps_s" :class="$style.previewControls">
							<MkRange v-model="draft.previewAngle" continuousUpdate :min="-0.5" :max="0.5" :step="0.025" :textConverter="(v) => `${Math.floor(v * 360)}°`">
								<template #label>{{ i18n.ts.angle }}</template>
							</MkRange>
							<MkRange v-model="draft.previewOffsetX" continuousUpdate :min="-0.25" :max="0.25" :step="0.025" :textConverter="(v) => `${Math.floor(v * 100)}%`">
								<template #label>X {{ i18n.ts.position }}</template>
							</MkRange>
							<MkRange v-model="draft.previewOffsetY" continuousUpdate :min="-0.25" :max="0.25" :step="0.025" :textConverter="(v) => `${Math.floor(v * 100)}%`">
								<template #label>Y {{ i18n.ts.position }}</template>
							</MkRange>
							<MkSwitch v-model="draft.previewFlipH">
								<template #label>{{ i18n.ts.flip }}</template>
							</MkSwitch>
						</div>
						<MkInfo>{{ i18n.ts._avatarDecorationRequestPage.previewAdjustHint }}</MkInfo>
					</div>

					<!-- JUICE: 差し替え申請(既存のデコレーションの画像だけを差し替える) -->
					<div class="_gaps_s">
						<MkSwitch :modelValue="draft.targetAvatarDecorationId != null" @update:modelValue="(v) => onToggleReplacement(draft, v)">
							<template #label>{{ i18n.ts._avatarDecorationRequestPage.replacementRequest }}</template>
							<template #caption>{{ i18n.ts._avatarDecorationRequestPage.replacementRequestCaption }}</template>
						</MkSwitch>
						<MkInfo v-if="draft.targetAvatarDecorationId != null">
							{{ i18n.ts._avatarDecorationRequestPage.replacementTarget }}: <b>{{ draft.name }}</b>
							<button class="_textButton" @click="pickReplacementTarget(draft)">{{ i18n.ts._avatarDecorationRequestPage.changeTarget }}</button>
						</MkInfo>
					</div>

					<MkInput v-model="draft.name" :readonly="draft.targetAvatarDecorationId != null">
						<template #label>{{ i18n.ts.name }}</template>
					</MkInput>

					<template v-if="draft.targetAvatarDecorationId == null">
						<MkTextarea v-model="draft.description">
							<template #label>{{ i18n.ts._avatarDecorationRequestPage.description }}</template>
						</MkTextarea>

						<MkInput v-model="draft.category">
							<template #label>{{ i18n.ts._avatarDecorationRequestPage.category }}</template>
						</MkInput>
					</template>
					<MkSwitch v-model="draft.deleteFileAfterReview">
						<template #label>{{ i18n.ts._avatarDecorationRequestPage.deleteFileAfterReview }}</template>
					</MkSwitch>
				</div>

				<MkCaptcha v-if="instance.enableHcaptcha" ref="hcaptcha" v-model="hCaptchaResponse" provider="hcaptcha" :sitekey="instance.hcaptchaSiteKey"/>
				<MkCaptcha v-if="instance.enableMcaptcha" ref="mcaptcha" v-model="mCaptchaResponse" provider="mcaptcha" :sitekey="instance.mcaptchaSiteKey" :instanceUrl="instance.mcaptchaInstanceUrl"/>
				<MkCaptcha v-if="instance.enableRecaptcha" ref="recaptcha" v-model="reCaptchaResponse" provider="recaptcha" :sitekey="instance.recaptchaSiteKey"/>
				<MkCaptcha v-if="instance.enableTurnstile" ref="turnstile" v-model="turnstileResponse" provider="turnstile" :sitekey="instance.turnstileSiteKey"/>
				<MkCaptcha v-if="instance.enableTestcaptcha" ref="testcaptcha" v-model="testcaptchaResponse" provider="testcaptcha" :sitekey="null"/>

				<MkButton primary rounded :disabled="shouldDisableSubmitting" @click="submit"><i class="ti ti-check"></i> {{ i18n.ts._avatarDecorationRequestPage.submit }}</MkButton>
			</div>
			<div v-else-if="tab === 'list'" class="_gaps">
				<MkInfo v-if="paginator.items.value.length === 0 && !paginator.fetching.value">{{ i18n.ts._avatarDecorationRequestPage.noRequests }}</MkInfo>
				<MkPagination v-slot="{items}" :paginator="paginator">
					<div class="_gaps">
						<MkAvatarDecorationRequestItem v-for="request in items" :key="request.id" :request="request"/>
					</div>
				</MkPagination>
			</div>
		</template>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref } from 'vue';
import * as Misskey from 'misskey-js';
import type { Captcha } from '@/components/MkCaptcha.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkRange from '@/components/MkRange.vue';
import MkButton from '@/components/MkButton.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkAvatarDecorationRequestItem from '@/components/MkAvatarDecorationRequestItem.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkCaptcha from '@/components/MkCaptcha.vue';
import * as os from '@/os.js';
import { selectFile } from '@/utility/drive.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { Paginator } from '@/utility/paginator.js';
import { ensureSignin } from '@/i.js';
import { instance } from '@/instance.js';
import { genId } from '@/utility/id.js';

const $i = ensureSignin();

const enabled = ref(true);
misskeyApi('juice/public-settings').then(res => {
	enabled.value = res.avatarDecorationRequestEnabled;
});

const tab = ref('form');

// JUICE: 複数の画像をまとめて選択すると、同じ画面から複数件をまとめて申請できる。
// 1件だけ選んだ場合も内部的には要素数1のdraftsとして扱う(見た目は従来通り単一フォーム)
type AvatarDecorationRequestDraft = {
	key: string;
	file: Misskey.entities.DriveFile;
	name: string;
	description: string;
	category: string;
	deleteFileAfterReview: boolean;
	// JUICE: プレビュー確認用の角度・位置・反転。装着ダイアログ(avatar-decoration.dialog.vue)と
	// 同じUI・値域だが、これは申請データには含めない(実際の角度・位置は装着する各ユーザーが個別に
	// 設定するものであり、デコレーション自体に固定の値は存在しないため)
	previewAngle: number;
	previewOffsetX: number;
	previewOffsetY: number;
	previewFlipH: boolean;
	// JUICE: 差し替え申請(既存のデコレーションの画像だけを差し替える)の対象。nullなら通常の新規申請
	targetAvatarDecorationId: string | null;
};

const drafts = ref<AvatarDecorationRequestDraft[]>([]);

// JUICE: 差し替え申請の対象選択用。自分の承認済み申請(デコレーションが実際に作られたもの)のみを
// 候補にする。初回に選択を試みたタイミングで一度だけ取得する
let myApprovedAvatarDecorationRequests: Misskey.entities.AvatarDecorationRequestEntry[] | null = null;

async function fetchMyApprovedAvatarDecorationRequests(): Promise<Misskey.entities.AvatarDecorationRequestEntry[]> {
	if (myApprovedAvatarDecorationRequests == null) {
		const fetched = await misskeyApi('avatar-decoration-requests/list', { status: 'approved', limit: 100 });
		myApprovedAvatarDecorationRequests = fetched;
		return fetched;
	}
	return myApprovedAvatarDecorationRequests;
}

async function pickReplacementTarget(draft: AvatarDecorationRequestDraft) {
	const requests = await fetchMyApprovedAvatarDecorationRequests();
	const eligible = requests.filter(r => r.resultAvatarDecorationId != null);
	if (eligible.length === 0) {
		os.alert({ type: 'info', text: i18n.ts._avatarDecorationRequestPage.noReplaceableAvatarDecorations });
		draft.targetAvatarDecorationId = null;
		return;
	}

	const { canceled, result } = await os.select({
		title: i18n.ts._avatarDecorationRequestPage.selectTargetAvatarDecoration,
		items: eligible.map(r => ({ value: r.resultAvatarDecorationId!, label: r.name })),
	});
	if (canceled || result == null) {
		if (draft.targetAvatarDecorationId == null) return;
	} else {
		draft.targetAvatarDecorationId = result;
		draft.name = eligible.find(r => r.resultAvatarDecorationId === result)?.name ?? draft.name;
	}
}

function onToggleReplacement(draft: AvatarDecorationRequestDraft, enabled: boolean) {
	if (enabled) {
		pickReplacementTarget(draft);
	} else {
		draft.targetAvatarDecorationId = null;
	}
}

// JUICE
function decorationForPreview(draft: AvatarDecorationRequestDraft) {
	return {
		url: draft.file.url,
		angle: draft.previewAngle,
		flipH: draft.previewFlipH,
		offsetX: draft.previewOffsetX,
		offsetY: draft.previewOffsetY,
	};
}

// JUICE
const hcaptcha = ref<Captcha | undefined>();
const mcaptcha = ref<Captcha | undefined>();
const recaptcha = ref<Captcha | undefined>();
const turnstile = ref<Captcha | undefined>();
const testcaptcha = ref<Captcha | undefined>();
const hCaptchaResponse = ref<string | null>(null);
const mCaptchaResponse = ref<string | null>(null);
const reCaptchaResponse = ref<string | null>(null);
const turnstileResponse = ref<string | null>(null);
const testcaptchaResponse = ref<string | null>(null);

const shouldDisableSubmitting = computed((): boolean => {
	return drafts.value.length === 0 || drafts.value.some(d => !d.name) ||
		instance.enableHcaptcha && !hCaptchaResponse.value ||
		instance.enableMcaptcha && !mCaptchaResponse.value ||
		instance.enableRecaptcha && !reCaptchaResponse.value ||
		instance.enableTurnstile && !turnstileResponse.value ||
		instance.enableTestcaptcha && !testcaptchaResponse.value;
});

const paginator = markRaw(new Paginator('avatar-decoration-requests/list', {
	limit: 10,
}));

function chooseFile(ev: PointerEvent) {
	selectFile({
		anchorElement: ev.currentTarget ?? ev.target,
		multiple: true,
	}).then(files => {
		for (const f of files) {
			drafts.value.push({
				key: genId(),
				file: f,
				name: f.name.replace(/\.(.+)$/, ''),
				description: '',
				category: '',
				deleteFileAfterReview: false,
				previewAngle: 0,
				previewOffsetX: 0,
				previewOffsetY: 0,
				previewFlipH: false,
				targetAvatarDecorationId: null,
			});
		}
	});
}

function removeDraft(key: string) {
	drafts.value = drafts.value.filter(d => d.key !== key);
}

function submit() {
	if (drafts.value.length === 0 || drafts.value.some(d => !d.name)) return;

	os.apiWithDialog('avatar-decoration-requests/create-many', {
		requests: drafts.value.map(d => ({
			fileId: d.file.id,
			name: d.name,
			description: d.description,
			category: d.category || null,
			deleteFileAfterReview: d.deleteFileAfterReview,
			targetAvatarDecorationId: d.targetAvatarDecorationId,
		})),
		'hcaptcha-response': hCaptchaResponse.value,
		'm-captcha-response': mCaptchaResponse.value,
		'g-recaptcha-response': reCaptchaResponse.value,
		'turnstile-response': turnstileResponse.value,
		'testcaptcha-response': testcaptchaResponse.value,
	}).then(requests => {
		for (const request of requests) {
			paginator.prepend(request);
		}
		drafts.value = [];
		tab.value = 'list';
	}).catch(() => {
		// JUICE: captcha検証失敗時などにウィジェットをリセットし、再送信できるようにする
		hcaptcha.value?.reset?.();
		mcaptcha.value?.reset?.();
		recaptcha.value?.reset?.();
		turnstile.value?.reset?.();
		testcaptcha.value?.reset?.();
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => [{
	key: 'form',
	title: i18n.ts._avatarDecorationRequestPage.newRequest,
	icon: 'ti ti-plus',
}, {
	key: 'list',
	title: i18n.ts._avatarDecorationRequestPage.myRequests,
	icon: 'ti ti-list',
}]);

definePage(() => ({
	title: i18n.ts._juice.avatarDecorationRequest,
	icon: 'ti ti-sparkles',
}));
</script>

<style lang="scss" module>
.draftCard {
	padding: 16px;
	border-radius: var(--MI-radius);
	border: var(--MI_THEME-panelBorder);
	background: var(--MI_THEME-panel);
}

.draftHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	font-weight: bold;
}

.draftRemoveButton {
	width: 32px;
	height: 32px;
	color: #ff2a2a;
}

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

// JUICE: 管理画面の新規作成ダイアログ(avatar-decoration-edit-dialog.vue)と同じ、
// 明背景・暗背景それぞれでの見え方を並べて確認できるプレビュー
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

// JUICE: 装着ダイアログと同じ角度・位置・反転の調整UI
.previewControls {
	max-width: 320px;
	margin: 0 auto;
}
</style>
