<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/juice" :label="i18n.ts.juice" :keywords="['juice', 'email', 'language']" icon="ti ti-droplet">
	<div class="_gaps_m">
		<MkInfo v-if="!instance.enableEmail">{{ i18n.ts.emailNotSupported }}</MkInfo>

		<MkDisableSection :disabled="!instance.enableEmail">
			<SearchMarker :keywords="['email', 'language']">
				<FormSection first>
					<template #label><SearchLabel>{{ i18n.ts._juice.emailLanguage }}</SearchLabel></template>
					<MkSelect v-model="emailLang" :items="langs.map(x => ({ label: x[1], value: x[0] }))" @update:modelValue="save">
						<template #caption>{{ i18n.ts._juice.emailLanguageCaption }}</template>
					</MkSelect>
				</FormSection>
			</SearchMarker>
		</MkDisableSection>

		<SearchMarker :keywords="['ai', 'generated', 'mute', 'hide']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts._juice.muteAIGeneratedNotes }}</SearchLabel></template>
				<MkSelect v-model="muteAIGeneratedNotes" :items="muteAIGeneratedNotesItems" @update:modelValue="saveMuteAIGeneratedNotes">
					<template #caption>{{ i18n.ts._juice.muteAIGeneratedNotesDescription }}</template>
				</MkSelect>
			</FormSection>
		</SearchMarker>

		<SearchMarker :keywords="['widget', 'side', 'left', 'right']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts._juice.widgetsSide }}</SearchLabel></template>
				<MkRadios v-model="widgetsSide" :options="[{ value: 'right', label: i18n.ts.right }, { value: 'left', label: i18n.ts.left }]">
					<template #caption>{{ i18n.ts._juice.widgetsSideCaption }}</template>
				</MkRadios>
			</FormSection>
		</SearchMarker>

		<SearchMarker v-if="relayTimelineEnabled" :keywords="['relay', 'timeline', 'filter']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts._juice.relayTimelineFilter }}</SearchLabel></template>
				<div class="_gaps_s">
					<MkInfo v-if="relays.length === 0">{{ i18n.ts._juice.relayTimelineFilterEmpty }}</MkInfo>
					<template v-else>
						<MkInfo>{{ i18n.ts._juice.relayTimelineFilterCaption }}</MkInfo>
						<MkSwitch
							v-for="relay in relays"
							:key="relay.id"
							:modelValue="isRelaySelected(relay.id)"
							@update:modelValue="(v) => onChangeRelayFilter(relay.id, v)"
						>
							<template #label>{{ relay.host }}</template>
						</MkSwitch>
					</template>
				</div>
			</FormSection>
		</SearchMarker>

		<SearchMarker :keywords="['language', 'timeline', 'filter']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts._juice.filteredLanguages }}</SearchLabel></template>
				<div class="_gaps_s">
					<MkInfo>{{ i18n.ts._juice.filteredLanguagesCaption }}</MkInfo>
					<MkSwitch
						v-for="[code, label] in langs"
						:key="code"
						:modelValue="isLanguageFilterSelected(code)"
						@update:modelValue="(v) => onChangeLanguageFilter(code, v)"
					>
						<template #label>{{ label }}</template>
					</MkSwitch>
				</div>
			</FormSection>
		</SearchMarker>

		<SearchMarker :keywords="['signup', 'approval', 'check']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts._juice.signupCheck }}</SearchLabel></template>
				<FormLink to="/signup-check">{{ i18n.ts._signupCheck.openPage }}</FormLink>
			</FormSection>
		</SearchMarker>

		<SearchMarker :keywords="['emoji', 'request']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts._juice.emojiRequest }}</SearchLabel></template>
				<div class="_gaps_s">
					<FormLink to="/emoji-request">{{ i18n.ts._emojiRequestPage.newRequest }}</FormLink>
					<SearchMarker :keywords="['emoji', 'request', 'email']">
						<MkSwitch :modelValue="$i.receiveEmojiRequestResultEmail" @update:modelValue="onChangeReceiveEmojiRequestResultEmail">
							<template #label><SearchLabel>{{ i18n.ts._juice.receiveEmojiRequestResultEmail }}</SearchLabel></template>
							<template #caption>{{ i18n.ts._juice.receiveEmojiRequestResultEmailCaption }}</template>
						</MkSwitch>
					</SearchMarker>
				</div>
			</FormSection>
		</SearchMarker>

		<SearchMarker :keywords="['avatar', 'decoration', 'request']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts._juice.avatarDecorationRequest }}</SearchLabel></template>
				<div class="_gaps_s">
					<FormLink to="/avatar-decoration-request">{{ i18n.ts._avatarDecorationRequestPage.newRequest }}</FormLink>
					<SearchMarker :keywords="['avatar', 'decoration', 'request', 'email']">
						<MkSwitch :modelValue="$i.receiveAvatarDecorationRequestResultEmail" @update:modelValue="onChangeReceiveAvatarDecorationRequestResultEmail">
							<template #label><SearchLabel>{{ i18n.ts._juice.receiveAvatarDecorationRequestResultEmail }}</SearchLabel></template>
							<template #caption>{{ i18n.ts._juice.receiveAvatarDecorationRequestResultEmailCaption }}</template>
						</MkSwitch>
					</SearchMarker>
				</div>
			</FormSection>
		</SearchMarker>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import { langs } from '@@/js/config.js';
import FormSection from '@/components/form/section.vue';
import FormLink from '@/components/form/link.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkDisableSection from '@/components/MkDisableSection.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';
import { juicePublicSettingsCache, juiceRelaysCache } from '@/cache.js';

const $i = ensureSignin();

const emailLang = ref($i.emailLang ?? 'ja-JP');
const muteAIGeneratedNotes = ref($i.muteAIGeneratedNotes ?? 'none');

// JUICE: リレータイムラインの絞り込み設定(機能自体が無効なインスタンスでは項目を出さない)
const relayTimelineEnabled = ref(false);
const relays = ref<Misskey.entities.JuiceRelaysResponse>([]);
juicePublicSettingsCache.fetch().then(res => {
	relayTimelineEnabled.value = res.relayTimelineEnabled;
	if (relayTimelineEnabled.value) {
		juiceRelaysCache.fetch().then(r => {
			relays.value = r;
		});
	}
});

function isRelaySelected(id: string): boolean {
	return prefer.r.relayTimelineFilter.value.includes(id);
}

function onChangeRelayFilter(id: string, checked: boolean) {
	prefer.commit('relayTimelineFilter', checked
		? [...prefer.s.relayTimelineFilter, id]
		: prefer.s.relayTimelineFilter.filter(x => x !== id));
}

// JUICE: タイムライン(ホーム・ローカル・グローバル)に表示する言語の絞り込み。
// リレーフィルタと異なりサーバー側(アカウント)の設定なので、i/updateへ保存する
const filteredLanguages = ref($i.filteredLanguages);

function isLanguageFilterSelected(code: string): boolean {
	return filteredLanguages.value.includes(code);
}

function onChangeLanguageFilter(code: string, checked: boolean) {
	filteredLanguages.value = checked
		? [...filteredLanguages.value, code]
		: filteredLanguages.value.filter(x => x !== code);
	misskeyApi('i/update', {
		filteredLanguages: filteredLanguages.value,
	});
}

// JUICE: ウィジェットパネル/ドロワーを画面のどちら側に表示するか
const widgetsSide = prefer.model('widgetsSide');

const muteAIGeneratedNotesItems = [
	{ label: i18n.ts.none, value: 'none' },
	{ label: i18n.ts._juice.muteAIGeneratedNotesMute, value: 'mute' },
	{ label: i18n.ts._juice.muteAIGeneratedNotesHardMute, value: 'hardMute' },
];

function save() {
	os.apiWithDialog('i/juice/update-email-lang', {
		// emailLang は langs (packages/i18n がサポートする言語コード一覧) から選ばれた値のみが入るが、
		// MkSelect の items 型が緩い string のため、送信時にエンドポイント側の厳密な enum 型へ合わせる
		emailLang: emailLang.value as Misskey.entities.IJuiceUpdateEmailLangRequest['emailLang'],
	});
}

function saveMuteAIGeneratedNotes() {
	os.apiWithDialog('i/juice/update-mute-ai-generated', {
		// MkSelect の items 型が緩い string のため、送信時にエンドポイント側の厳密な enum 型へ合わせる
		muteAIGeneratedNotes: muteAIGeneratedNotes.value as Misskey.entities.IJuiceUpdateMuteAiGeneratedRequest['muteAIGeneratedNotes'],
	});
}

function onChangeReceiveEmojiRequestResultEmail(v: boolean) {
	misskeyApi('i/update', {
		receiveEmojiRequestResultEmail: v,
	});
}

function onChangeReceiveAvatarDecorationRequestResultEmail(v: boolean) {
	misskeyApi('i/update', {
		receiveAvatarDecorationRequestResultEmail: v,
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.juice,
	icon: 'ti ti-droplet',
}));
</script>
