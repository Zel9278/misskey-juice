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
				<MkButton rounded style="margin: 0 auto;" @click="chooseFile">{{ i18n.ts.selectFile }}</MkButton>
				<!-- JUICE: 複数の画像をまとめて選択すると、同じ画面から複数件をまとめて申請できる -->
				<MkInfo v-if="drafts.length === 0">{{ i18n.ts._emojiRequestPage.multipleRequestsHint }}</MkInfo>

				<div v-for="(draft, i) in drafts" :key="draft.key" class="_gaps_s" :class="$style.draftCard">
					<div v-if="drafts.length > 1" :class="$style.draftHeader">
						<span>{{ i18n.tsx._emojiRequestPage.requestNumber({ n: i + 1 }) }}</span>
						<button class="_button" :class="$style.draftRemoveButton" @click="removeDraft(draft.key)">
							<i class="ti ti-x"></i>
						</button>
					</div>

					<div :class="$style.imgs">
						<div style="background: #000;" :class="$style.imgContainer">
							<img :src="draft.file.url" :class="$style.img"/>
						</div>
						<div style="background: #222;" :class="$style.imgContainer">
							<img :src="draft.file.url" :class="$style.img"/>
						</div>
						<div style="background: #ddd;" :class="$style.imgContainer">
							<img :src="draft.file.url" :class="$style.img"/>
						</div>
						<div style="background: #fff;" :class="$style.imgContainer">
							<img :src="draft.file.url" :class="$style.img"/>
						</div>
					</div>

					<!-- JUICE: この絵文字をノートにリアクションした場合の見た目のサンプルをMkNote(mockモード)で表示する -->
					<div :class="$style.reactionPreview">
						<div :class="$style.previewLabel">{{ i18n.ts._emojiRequestPage.preview }}</div>
						<div :class="$style.previewCaption">{{ i18n.ts._emojiRequestPage.previewCaption }}</div>
						<MkNote :mock="true" :note="exampleNoteFor(draft)" :class="$style.previewNote"/>
					</div>

					<MkInput v-model="draft.name" pattern="[a-z0-9_]" autocapitalize="off">
						<template #label>{{ i18n.ts.name }}</template>
					</MkInput>

					<MkInput v-model="draft.category" :datalist="customEmojiCategories.filter(x => x != null)">
						<template #label>{{ i18n.ts.category }}</template>
					</MkInput>

					<MkInput v-model="draft.aliases" autocapitalize="off">
						<template #label>{{ i18n.ts.tags }}</template>
						<template #caption>
							{{ i18n.ts.theKeywordWhenSearchingForCustomEmoji }}<br/>
							{{ i18n.ts.setMultipleBySeparatingWithSpace }}
						</template>
					</MkInput>

					<MkInput v-model="draft.license" :mfmAutocomplete="true">
						<template #label>{{ i18n.ts.license }}</template>
					</MkInput>

					<MkSwitch v-model="draft.isSensitive">{{ i18n.ts.sensitive }}</MkSwitch>
					<MkSwitch v-model="draft.localOnly">{{ i18n.ts.localOnly }}</MkSwitch>
					<MkSwitch v-model="draft.deleteFileAfterReview">
						<template #label>{{ i18n.ts._emojiRequestPage.deleteFileAfterReview }}</template>
					</MkSwitch>
				</div>

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
import MkNote from '@/components/MkNote.vue';
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
import { genId } from '@/utility/id.js';

const $i = ensureSignin();

const enabled = ref(true);
misskeyApi('juice/public-settings').then(res => {
	enabled.value = res.emojiRequestEnabled;
});

const tab = ref('form');

// JUICE: 複数の画像をまとめて選択すると、同じ画面から複数件をまとめて申請できる。
// 1件だけ選んだ場合も内部的には要素数1のdraftsとして扱う(見た目は従来通り単一フォーム)
type EmojiRequestDraft = {
	key: string;
	file: Misskey.entities.DriveFile;
	name: string;
	category: string;
	aliases: string;
	license: string;
	isSensitive: boolean;
	localOnly: boolean;
	deleteFileAfterReview: boolean;
};

const drafts = ref<EmojiRequestDraft[]>([]);

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

// JUICE: 申請中の絵文字をリアクションとして使った場合の見た目のプレビュー用。
// まだ承認されていない(=正式な絵文字として登録されていない)画像のため、
// note.reactionEmojisでアップロード直後(=draft.file.url)を直接差し込んで表示する
// (MkReactionsViewer.reaction.vue参照。既存のアバターデコレーション申請の
// プレビュー(MkAvatarのdecorations上書き)と同じ考え方)
function exampleNoteFor(draft: EmojiRequestDraft): Misskey.entities.Note {
	const previewName = draft.name || 'preview';
	return {
		id: '0000000000',
		createdAt: new Date().toISOString(),
		userId: $i.id,
		user: $i,
		text: i18n.ts._emojiRequestPage.previewSampleNoteText,
		cw: null,
		visibility: 'public',
		localOnly: false,
		isAIGenerated: false,
		reactionAcceptance: null,
		renoteCount: 0,
		repliesCount: 0,
		reactionCount: 1,
		reactions: { [`:${previewName}:`]: 1 },
		reactionEmojis: { [previewName]: draft.file.url },
		fileIds: [],
		files: [],
		replyId: null,
		renoteId: null,
	};
}

const shouldDisableSubmitting = computed((): boolean => {
	return drafts.value.length === 0 || drafts.value.some(d => !d.name) ||
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
		multiple: true,
	}).then(files => {
		for (const f of files) {
			const candidate = f.name.replace(/\.(.+)$/, '');
			drafts.value.push({
				key: genId(),
				file: f,
				name: candidate.match(/^[a-z0-9_]+$/) ? candidate : '',
				category: '',
				aliases: '',
				license: '',
				isSensitive: false,
				localOnly: false,
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

	os.apiWithDialog('emoji-requests/create-many', {
		requests: drafts.value.map(d => ({
			fileId: d.file.id,
			name: d.name,
			category: d.category || null,
			aliases: d.aliases.split(' ').filter(x => x !== ''),
			license: d.license || null,
			isSensitive: d.isSensitive,
			localOnly: d.localOnly,
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

.reactionPreview {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
}

.previewLabel {
	font-size: 0.85em;
	opacity: 0.7;
}

.previewCaption {
	font-size: 0.85em;
	opacity: 0.7;
	text-align: center;
}

.previewNote {
	width: 100%;
	border-radius: var(--MI-radius);
	border: var(--MI_THEME-panelBorder);
	background: var(--MI_THEME-panel);
	pointer-events: none;
}
</style>
