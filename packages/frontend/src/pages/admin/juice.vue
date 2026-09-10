<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/juice" :label="i18n.ts.juice" :keywords="['juice']" icon="ti ti-droplet">
			<div class="_gaps_m">
				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._juice.approvalSignup }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkSwitch v-model="approvalRequiredForSignup">
									<template #label><SearchLabel>{{ i18n.ts._juice.approvalRequiredForSignup }}</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker>
								<MkSwitch v-model="signupReasonRequired" :disabled="!approvalRequiredForSignup">
									<template #label><SearchLabel>{{ i18n.ts._juice.signupReasonRequired }}</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="signupReasonMaxLength" type="number" :min="1" :disabled="!approvalRequiredForSignup">
									<template #label><SearchLabel>{{ i18n.ts._juice.signupReasonMaxLength }}</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkSwitch v-model="invitationRegistrationEnabled">
									<template #label><SearchLabel>{{ i18n.ts._juice.invitationRegistrationEnabled }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._juice.invitationRegistrationEnabledCaption }}</template>
								</MkSwitch>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._juice.exploreOtherServers }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkSwitch v-model="exploreOtherServersEnabled">
									<template #label><SearchLabel>{{ i18n.ts._juice.exploreOtherServersEnabled }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._juice.exploreOtherServersEnabledCaption }}</template>
								</MkSwitch>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._juice.emailLanguage }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkSelect v-model="defaultEmailLang" :items="langs.map(x => ({ label: x[1], value: x[0] }))">
									<template #label><SearchLabel>{{ i18n.ts._juice.defaultEmailLang }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._juice.defaultEmailLangCaption }}</template>
								</MkSelect>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._juice.emojiRequest }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkSwitch v-model="emojiRequestEnabled">
									<template #label><SearchLabel>{{ i18n.ts._juice.emojiRequestEnabled }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._juice.emojiRequestEnabledCaption }}</template>
								</MkSwitch>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._juice.avatarDecorationRequest }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkSwitch v-model="avatarDecorationRequestEnabled">
									<template #label><SearchLabel>{{ i18n.ts._juice.avatarDecorationRequestEnabled }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._juice.avatarDecorationRequestEnabledCaption }}</template>
								</MkSwitch>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._juice.ranking }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkInput v-model="rankingAggregationPeriodHours" type="number" :min="1">
									<template #label><SearchLabel>{{ i18n.ts._juice.rankingPeriodHours }}</SearchLabel></template>
								</MkInput>
							</SearchMarker>
							<SearchMarker>
								<MkInput v-model="rankingDisplayCount" type="number" :min="1" :max="100">
									<template #label><SearchLabel>{{ i18n.ts._juice.rankingDisplayCount }}</SearchLabel></template>
								</MkInput>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._juice.relayTimeline }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkSwitch v-model="relayTimelineEnabled">
									<template #label><SearchLabel>{{ i18n.ts._juice.relayTimelineEnabled }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._juice.relayTimelineEnabledCaption }}</template>
								</MkSwitch>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._juice.mediaTimeline }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkSwitch v-model="mediaTimelineEnabled">
									<template #label><SearchLabel>{{ i18n.ts._juice.mediaTimelineEnabled }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._juice.mediaTimelineEnabledCaption }}</template>
								</MkSwitch>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._juice.latex }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkSwitch v-model="latexEnabled">
									<template #label><SearchLabel>{{ i18n.ts._juice.latexEnabled }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._juice.latexEnabledCaption }}</template>
								</MkSwitch>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._juice.reactionPiggyback }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkSwitch v-model="reactionPiggybackOnRemoteEnabled">
									<template #label><SearchLabel>{{ i18n.ts._juice.reactionPiggybackOnRemoteEnabled }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._juice.reactionPiggybackOnRemoteEnabledCaption }}</template>
								</MkSwitch>
							</SearchMarker>

							<MkInfo v-if="reactionPiggybackOnRemoteEnabled" warn>
								<div class="_gaps_s">
									<div>{{ i18n.ts._aboutJuice.reactionPiggybackOnRemoteWarningLicense }}</div>
									<I18n :src="i18n.ts._aboutJuice.reactionPiggybackOnRemoteWarningTestNotice" tag="div">
									<template #juiceServer>
										<a href="https://mk-juice.dev" target="_blank" rel="noopener" class="_link">{{ i18n.ts._aboutJuice.reactionPiggybackOnRemoteWarningTestNoticeLinkText }}</a>
									</template>
								</I18n>
								</div>
							</MkInfo>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._contactForm._settings.title }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkSwitch v-model="contactFormEnabled">
									<template #label><SearchLabel>{{ i18n.ts._contactForm._settings.enable }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._contactForm._settings.enableDescription }}</template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="contactFormLimit" type="number" :min="1" :max="100" :disabled="!contactFormEnabled">
									<template #label><SearchLabel>{{ i18n.ts._contactForm._settings.limit }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._contactForm._settings.limitDescription }}</template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkSwitch v-model="contactFormRequireAuth" :disabled="!contactFormEnabled">
									<template #label><SearchLabel>{{ i18n.ts._contactForm._settings.requireAuth }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._contactForm._settings.requireAuthDescription }}</template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="contactFormContentMaxLength" type="number" :min="20" :max="10000" :disabled="!contactFormEnabled">
									<template #label><SearchLabel>{{ i18n.ts._contactForm._settings.contentMaxLength }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._contactForm._settings.contentMaxLengthDescription }}</template>
								</MkInput>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._juice.splashSettingsTitle }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkTextarea v-model="customSplashTextInput">
									<template #label><SearchLabel>{{ i18n.ts._juice.customSplashText }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._juice.customSplashTextDescription }} {{ i18n.tsx._juice.customSplashTextLineCountCaption({ current: customSplashTextLines.length, max: CUSTOM_SPLASH_TEXT_MAX_ITEMS }) }}</template>
								</MkTextarea>
								<div v-if="customSplashTextTooManyLines" :class="$style.fieldError">
									<i class="ti ti-exclamation-triangle" style="margin-right: 4px;"></i>
									{{ i18n.ts._juice.customSplashTextTooManyLines }}
								</div>
								<div v-if="customSplashTextTooLongLineCount > 0" :class="$style.fieldError">
									<i class="ti ti-exclamation-triangle" style="margin-right: 4px;"></i>
									{{ i18n.tsx._juice.customSplashTextLineTooLong({ n: customSplashTextTooLongLineCount }) }}
								</div>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<MkButton primary :disabled="customSplashTextTooManyLines || customSplashTextTooLongLineCount > 0" @click="save">{{ i18n.ts.save }}</MkButton>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { langs } from '@@/js/config.js';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

const settings = await misskeyApi('admin/juice/settings');

const approvalRequiredForSignup = ref(settings.approvalRequiredForSignup);
const signupReasonRequired = ref(settings.signupReasonRequired);
const signupReasonMaxLength = ref(settings.signupReasonMaxLength);
const invitationRegistrationEnabled = ref(settings.invitationRegistrationEnabled);
const exploreOtherServersEnabled = ref(settings.exploreOtherServersEnabled);
const defaultEmailLang = ref(settings.defaultEmailLang);
const emojiRequestEnabled = ref(settings.emojiRequestEnabled);
const avatarDecorationRequestEnabled = ref(settings.avatarDecorationRequestEnabled);
const rankingAggregationPeriodHours = ref(settings.rankingAggregationPeriodHours);
const rankingDisplayCount = ref(settings.rankingDisplayCount);
const relayTimelineEnabled = ref(settings.relayTimelineEnabled);
const mediaTimelineEnabled = ref(settings.mediaTimelineEnabled);
const latexEnabled = ref(settings.latexEnabled);
const reactionPiggybackOnRemoteEnabled = ref(settings.reactionPiggybackOnRemoteEnabled);
const contactFormEnabled = ref(settings.contactFormEnabled);
const contactFormLimit = ref(settings.contactFormLimit);
const contactFormRequireAuth = ref(settings.contactFormRequireAuth);
const contactFormContentMaxLength = ref(settings.contactFormContentMaxLength);
// JUICE: 配列を1行1件のテキストエリアとして編集する(空行は無視する)。
// 上限(行数・1行あたりの文字数)はadmin/juice/update-settingsのparamDefと合わせている
const customSplashTextInput = ref(settings.customSplashText.join('\n'));
const CUSTOM_SPLASH_TEXT_MAX_ITEMS = 20;
const CUSTOM_SPLASH_TEXT_MAX_LENGTH = 256;
const customSplashTextLines = computed(() => customSplashTextInput.value.split('\n').map(x => x.trim()).filter(x => x.length > 0));
const customSplashTextTooManyLines = computed(() => customSplashTextLines.value.length > CUSTOM_SPLASH_TEXT_MAX_ITEMS);
const customSplashTextTooLongLineCount = computed(() => customSplashTextLines.value.filter(x => x.length > CUSTOM_SPLASH_TEXT_MAX_LENGTH).length);

function save() {
	os.apiWithDialog('admin/juice/update-settings', {
		approvalRequiredForSignup: approvalRequiredForSignup.value,
		signupReasonRequired: signupReasonRequired.value,
		signupReasonMaxLength: signupReasonMaxLength.value,
		invitationRegistrationEnabled: invitationRegistrationEnabled.value,
		exploreOtherServersEnabled: exploreOtherServersEnabled.value,
		defaultEmailLang: defaultEmailLang.value,
		emojiRequestEnabled: emojiRequestEnabled.value,
		avatarDecorationRequestEnabled: avatarDecorationRequestEnabled.value,
		rankingAggregationPeriodHours: rankingAggregationPeriodHours.value,
		rankingDisplayCount: rankingDisplayCount.value,
		relayTimelineEnabled: relayTimelineEnabled.value,
		mediaTimelineEnabled: mediaTimelineEnabled.value,
		latexEnabled: latexEnabled.value,
		reactionPiggybackOnRemoteEnabled: reactionPiggybackOnRemoteEnabled.value,
		contactFormEnabled: contactFormEnabled.value,
		contactFormLimit: contactFormLimit.value,
		contactFormRequireAuth: contactFormRequireAuth.value,
		contactFormContentMaxLength: contactFormContentMaxLength.value,
		customSplashText: customSplashTextLines.value,
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.juice,
	icon: 'ti ti-droplet',
}));
</script>

<style lang="scss" module>
.fieldError {
	margin-top: 8px;
	color: var(--MI_THEME-error);
	font-size: 0.9em;
}
</style>
