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

		<SearchMarker :keywords="['widget', 'mobile', 'place', 'left', 'right', 'order']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts._juice.widgetPlace }}</SearchLabel></template>
				<div class="_gaps_s">
					<MkInfo v-if="widgets.length === 0">{{ i18n.ts._juice.widgetPlaceEmpty }}</MkInfo>
					<template v-else>
						<MkInfo>{{ i18n.ts._juice.widgetPlaceCaption }}</MkInfo>
						<MkSwitch
							v-for="widget in widgets"
							:key="widget.id"
							:modelValue="widget.place === 'left'"
							@update:modelValue="(v) => onChangeWidgetPlace(widget.id, v)"
						>
							<template #label>{{ i18n.ts._widgets[widget.name as typeof widgetDefs[number]] }}</template>
						</MkSwitch>
					</template>
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
import MkDisableSection from '@/components/MkDisableSection.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';
import { widgets as widgetDefs } from '@/widgets/index.js';

const $i = ensureSignin();

const emailLang = ref($i.emailLang ?? 'ja-JP');
const muteAIGeneratedNotes = ref($i.muteAIGeneratedNotes ?? 'none');

// ウィジェット編集モード(MkWidgets.vue)のplace切り替えボタンと同じく、
// 既に配置済みのウィジェットは連合無効化などで一時的に選択肢から外れていても編集対象からは外さない
const widgets = computed(() => prefer.r.widgets.value);

function onChangeWidgetPlace(id: string, isLeft: boolean) {
	prefer.commit('widgets', prefer.s.widgets.map(w => w.id === id ? {
		...w,
		place: isLeft ? 'left' : 'right',
	} : w));
}

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

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.juice,
	icon: 'ti ti-droplet',
}));
</script>
