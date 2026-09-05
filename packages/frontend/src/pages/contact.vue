<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 600px; --MI_SPACER-min: 20px;">
		<div class="_gaps_m">
			<!-- JUICE: misskey-tempuraのコンタクトフォームを参考に追加 -->
			<div v-if="contactFormEnabled" style="text-align: center;">
				<MkButton primary rounded type="routerLink" to="/contact-form">
					<i class="ti ti-mail"></i> {{ i18n.ts._contactForm._userForm.contactForm }}
				</MkButton>
			</div>
			<MkKeyValue :copy="instance.maintainerName">
				<template #key>{{ i18n.ts.administrator }}</template>
				<template #value>
					<template v-if="instance.maintainerName">{{ instance.maintainerName }}</template>
					<span v-else style="opacity: 0.7;">({{ i18n.ts.none }})</span>
				</template>
			</MkKeyValue>
			<MkKeyValue :copy="instance.maintainerEmail">
				<template #key>{{ i18n.ts.contact }}</template>
				<template #value>
					<template v-if="instance.maintainerEmail">{{ instance.maintainerEmail }}</template>
					<span v-else style="opacity: 0.7;">({{ i18n.ts.none }})</span>
				</template>
			</MkKeyValue>
			<MkKeyValue :copy="instance.inquiryUrl">
				<template #key>{{ i18n.ts.inquiry }}</template>
				<template #value>
					<MkLink v-if="instance.inquiryUrl" :url="instance.inquiryUrl" target="_blank">{{ instance.inquiryUrl }}</MkLink>
					<span v-else style="opacity: 0.7;">({{ i18n.ts.none }})</span>
				</template>
			</MkKeyValue>
			<MkFolder @opened="onOpened">
				<template #icon><i class="ti ti-report-search"></i></template>
				<template #label>{{ i18n.ts.deviceInfo }}</template>
				<template #caption>{{ i18n.ts.deviceInfoDescription }}</template>
				<MkLoading v-if="userEnv == null" />
				<MkCode v-else lang="json" :code="JSON.stringify(userEnv, null, 2)" style="max-height: 300px; overflow: auto;"/>
			</MkFolder>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { definePage } from '@/page.js';
import { getUserEnvironment } from '@/utility/get-user-environment.js';
import type { UserEnvironment } from '@/utility/get-user-environment.js';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkLink from '@/components/MkLink.vue';
import MkCode from '@/components/MkCode.vue';
import MkButton from '@/components/MkButton.vue';
import { juicePublicSettingsCache } from '@/cache.js';

// JUICE: misskey-tempuraのコンタクトフォームを参考に追加
// 設定取得に失敗した場合にボタンが出なくなるのを避けるため、フェイルオープン(common.tsのメニュー表示と同じ方針)にする
const contactFormEnabled = ref(true);
juicePublicSettingsCache.fetch().then(settings => {
	contactFormEnabled.value = settings.contactFormEnabled;
}).catch(err => {
	console.error('Failed to fetch juice public settings', err);
});

const userEnv = ref<UserEnvironment | null>(null);

async function onOpened() {
	if (userEnv.value == null) {
		userEnv.value = await getUserEnvironment();
	}
}

definePage(() => ({
	title: i18n.ts.inquiry,
	icon: 'ti ti-help-circle',
}));
</script>
