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
						<MkAvatar :class="$style.previewAvatar" :user="$i" :decorations="[{ url: draft.file.url, angle: 0, flipH: false, offsetX: 0, offsetY: 0 }]" forceShowDecoration/>
					</div>

					<MkInput v-model="draft.name">
						<template #label>{{ i18n.ts.name }}</template>
					</MkInput>

					<MkTextarea v-model="draft.description">
						<template #label>{{ i18n.ts._avatarDecorationRequestPage.description }}</template>
					</MkTextarea>

					<MkInput v-model="draft.category">
						<template #label>{{ i18n.ts._avatarDecorationRequestPage.category }}</template>
					</MkInput>

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
};

const drafts = ref<AvatarDecorationRequestDraft[]>([]);

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
	align-items: center;
	gap: 8px;
}

.previewLabel {
	font-size: 0.85em;
	opacity: 0.7;
}

.previewAvatar {
	width: 80px;
	height: 80px;
}
</style>
