<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<MkInfo v-if="!enabled">{{ i18n.ts._emojiRequestPage.disabled }}</MkInfo>
		<template v-else>
			<div v-if="tab === 'form'" class="_gaps_m">
				<div v-if="file" :class="$style.imgs">
					<div style="background: #000;" :class="$style.imgContainer">
						<img :src="file.url" :class="$style.img"/>
					</div>
					<div style="background: #222;" :class="$style.imgContainer">
						<img :src="file.url" :class="$style.img"/>
					</div>
					<div style="background: #ddd;" :class="$style.imgContainer">
						<img :src="file.url" :class="$style.img"/>
					</div>
					<div style="background: #fff;" :class="$style.imgContainer">
						<img :src="file.url" :class="$style.img"/>
					</div>
				</div>
				<MkButton rounded style="margin: 0 auto;" @click="chooseFile">{{ i18n.ts.selectFile }}</MkButton>

				<MkInput v-model="name" pattern="[a-z0-9_]" autocapitalize="off">
					<template #label>{{ i18n.ts.name }}</template>
				</MkInput>

				<MkInput v-model="category" :datalist="customEmojiCategories.filter(x => x != null)">
					<template #label>{{ i18n.ts.category }}</template>
				</MkInput>

				<MkInput v-model="aliases" autocapitalize="off">
					<template #label>{{ i18n.ts.tags }}</template>
					<template #caption>
						{{ i18n.ts.theKeywordWhenSearchingForCustomEmoji }}<br/>
						{{ i18n.ts.setMultipleBySeparatingWithSpace }}
					</template>
				</MkInput>

				<MkInput v-model="license" :mfmAutocomplete="true">
					<template #label>{{ i18n.ts.license }}</template>
				</MkInput>

				<MkSwitch v-model="isSensitive">{{ i18n.ts.sensitive }}</MkSwitch>
				<MkSwitch v-model="localOnly">{{ i18n.ts.localOnly }}</MkSwitch>
				<MkSwitch v-model="deleteFileAfterReview">
					<template #label>{{ i18n.ts._emojiRequestPage.deleteFileAfterReview }}</template>
				</MkSwitch>

				<MkCaptcha v-if="instance.enableHcaptcha" ref="hcaptcha" v-model="hCaptchaResponse" provider="hcaptcha" :sitekey="instance.hcaptchaSiteKey"/>
				<MkCaptcha v-if="instance.enableMcaptcha" ref="mcaptcha" v-model="mCaptchaResponse" provider="mcaptcha" :sitekey="instance.mcaptchaSiteKey" :instanceUrl="instance.mcaptchaInstanceUrl"/>
				<MkCaptcha v-if="instance.enableRecaptcha" ref="recaptcha" v-model="reCaptchaResponse" provider="recaptcha" :sitekey="instance.recaptchaSiteKey"/>
				<MkCaptcha v-if="instance.enableTurnstile" ref="turnstile" v-model="turnstileResponse" provider="turnstile" :sitekey="instance.turnstileSiteKey"/>
				<MkCaptcha v-if="instance.enableTestcaptcha" ref="testcaptcha" v-model="testcaptchaResponse" provider="testcaptcha" :sitekey="null"/>

				<MkButton primary rounded :disabled="shouldDisableSubmitting" @click="submit"><i class="ti ti-check"></i> {{ i18n.ts._emojiRequestPage.submit }}</MkButton>
			</div>
			<div v-else-if="tab === 'list'" class="_gaps">
				<MkInfo v-if="paginator.items.value.length === 0 && !paginator.fetching.value">{{ i18n.ts._emojiRequestPage.noRequests }}</MkInfo>
				<MkPagination v-slot="{items}" :paginator="paginator">
					<div class="_gaps">
						<MkEmojiRequestItem v-for="request in items" :key="request.id" :request="request"/>
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
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkButton from '@/components/MkButton.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkEmojiRequestItem from '@/components/MkEmojiRequestItem.vue';
import type { Captcha } from '@/components/MkCaptcha.vue';
import MkCaptcha from '@/components/MkCaptcha.vue';
import * as os from '@/os.js';
import { selectFile } from '@/utility/drive.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { customEmojiCategories } from '@/custom-emojis.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { Paginator } from '@/utility/paginator.js';
import { ensureSignin } from '@/i.js';
import { instance } from '@/instance.js';

ensureSignin();

const enabled = ref(true);
misskeyApi('juice/public-settings').then(res => {
	enabled.value = res.emojiRequestEnabled;
});

const tab = ref('form');
const file = ref<Misskey.entities.DriveFile | null>(null);
const name = ref('');
const category = ref('');
const aliases = ref('');
const license = ref('');
const isSensitive = ref(false);
const localOnly = ref(false);
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

const paginator = markRaw(new Paginator('emoji-requests/list', {
	limit: 10,
}));

function chooseFile(ev: PointerEvent) {
	selectFile({
		anchorElement: ev.currentTarget ?? ev.target,
		multiple: false,
	}).then(f => {
		file.value = f;
		const candidate = f.name.replace(/\.(.+)$/, '');
		if (candidate.match(/^[a-z0-9_]+$/)) {
			name.value = candidate;
		}
	});
}

function submit() {
	if (file.value == null || !name.value) return;

	os.apiWithDialog('emoji-requests/create', {
		fileId: file.value.id,
		name: name.value,
		category: category.value || null,
		aliases: aliases.value.split(' ').filter(x => x !== ''),
		license: license.value || null,
		isSensitive: isSensitive.value,
		localOnly: localOnly.value,
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
		category.value = '';
		aliases.value = '';
		license.value = '';
		isSensitive.value = false;
		localOnly.value = false;
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
	title: i18n.ts._emojiRequestPage.newRequest,
	icon: 'ti ti-plus',
}, {
	key: 'list',
	title: i18n.ts._emojiRequestPage.myRequests,
	icon: 'ti ti-list',
}]);

definePage(() => ({
	title: i18n.ts._juice.emojiRequest,
	icon: 'ti ti-mood-plus',
}));
</script>

<style lang="scss" module>
.imgs {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	justify-content: center;
}

.imgContainer {
	padding: 8px;
	border-radius: 6px;
}

.img {
	display: block;
	height: 64px;
	width: 64px;
	object-fit: contain;
}
</style>
