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

		<SearchMarker :keywords="['emoji', 'request']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts._juice.emojiRequest }}</SearchLabel></template>
				<FormLink to="/emoji-request">{{ i18n.ts._emojiRequest.newRequest }}</FormLink>
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
import MkDisableSection from '@/components/MkDisableSection.vue';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { instance } from '@/instance.js';

const $i = ensureSignin();

const emailLang = ref($i.emailLang ?? 'ja-JP');
const muteAIGeneratedNotes = ref($i.muteAIGeneratedNotes ?? 'none');

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

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.juice,
	icon: 'ti ti-droplet',
}));
</script>
