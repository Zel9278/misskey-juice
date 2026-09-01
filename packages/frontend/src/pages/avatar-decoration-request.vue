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
				<div v-if="file" :class="$style.preview">
					<div :class="$style.previewLabel">{{ i18n.ts._avatarDecorationRequestPage.preview }}</div>
					<MkAvatar :class="$style.previewAvatar" :user="$i" :decorations="[{ url: file.url, angle: 0, flipH: false, offsetX: 0, offsetY: 0 }]" forceShowDecoration/>
				</div>
				<MkButton rounded style="margin: 0 auto;" @click="chooseFile">{{ i18n.ts.selectFile }}</MkButton>

				<MkInput v-model="name">
					<template #label>{{ i18n.ts.name }}</template>
				</MkInput>

				<MkTextarea v-model="description">
					<template #label>{{ i18n.ts._avatarDecorationRequestPage.description }}</template>
				</MkTextarea>

				<MkInput v-model="category">
					<template #label>{{ i18n.ts._avatarDecorationRequestPage.category }}</template>
				</MkInput>

				<MkSwitch v-model="deleteFileAfterReview">
					<template #label>{{ i18n.ts._avatarDecorationRequestPage.deleteFileAfterReview }}</template>
				</MkSwitch>

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

const $i = ensureSignin();

const enabled = ref(true);
misskeyApi('juice/public-settings').then(res => {
	enabled.value = res.avatarDecorationRequestEnabled;
});

const tab = ref('form');
const file = ref<Misskey.entities.DriveFile | null>(null);
const name = ref('');
const description = ref('');
const category = ref('');
const deleteFileAfterReview = ref(false);

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
	return !file.value || !name.value ||
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
		multiple: false,
	}).then(f => {
		file.value = f;
		if (!name.value) {
			name.value = f.name.replace(/\.(.+)$/, '');
		}
	});
}

function submit() {
	if (file.value == null || !name.value) return;

	os.apiWithDialog('avatar-decoration-requests/create', {
		fileId: file.value.id,
		name: name.value,
		description: description.value,
		category: category.value || null,
		deleteFileAfterReview: deleteFileAfterReview.value,
		'hcaptcha-response': hCaptchaResponse.value,
		'm-captcha-response': mCaptchaResponse.value,
		'g-recaptcha-response': reCaptchaResponse.value,
		'turnstile-response': turnstileResponse.value,
		'testcaptcha-response': testcaptchaResponse.value,
	}).then(request => {
		paginator.prepend(request);
		file.value = null;
		name.value = '';
		description.value = '';
		category.value = '';
		deleteFileAfterReview.value = false;
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
