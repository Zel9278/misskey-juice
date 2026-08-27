<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<MkInfo v-if="!enabled">{{ i18n.ts._emojiRequest.disabled }}</MkInfo>
		<template v-else>
			<div v-if="tab === 'form'" class="_gaps_m">
				<div v-if="file" :class="$style.filePreview">
					<img :class="$style.fileImg" :src="file.url"/>
				</div>
				<div class="_buttonsCenter">
					<MkButton primary rounded @click="onFileSelectClicked">{{ i18n.ts.upload }}</MkButton>
					<MkButton primary rounded @click="onDriveSelectClicked">{{ i18n.ts.fromDrive }}</MkButton>
				</div>

				<MkInput v-model="name" pattern="^[a-zA-Z0-9_]+$">
					<template #label>{{ i18n.ts._emojiRequest.name }}</template>
				</MkInput>

				<MkInput v-model="category">
					<template #label>{{ i18n.ts._emojiRequest.category }}</template>
				</MkInput>

				<MkInput v-model="license">
					<template #label>{{ i18n.ts._emojiRequest.license }}</template>
				</MkInput>

				<MkSwitch v-model="deleteFileAfterReview">
					<template #label>{{ i18n.ts._emojiRequest.deleteFileAfterReview }}</template>
				</MkSwitch>

				<MkButton primary rounded :disabled="!file || !name" @click="submit">{{ i18n.ts._emojiRequest.submit }}</MkButton>
			</div>
			<div v-else-if="tab === 'list'" class="_gaps">
				<MkInfo v-if="paginator.items.value.length === 0 && !paginator.fetching.value">{{ i18n.ts._emojiRequest.noRequests }}</MkInfo>
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
import * as os from '@/os.js';
import { chooseFileFromPcAndUpload, chooseDriveFile } from '@/utility/drive.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { Paginator } from '@/utility/paginator.js';
import { ensureSignin } from '@/i.js';

ensureSignin();

const enabled = ref(true);
misskeyApi('juice/public-settings').then(res => {
	enabled.value = res.emojiRequestEnabled;
});

const tab = ref('form');
const file = ref<Misskey.entities.DriveFile | null>(null);
const name = ref('');
const category = ref('');
const license = ref('');
const deleteFileAfterReview = ref(false);

const paginator = markRaw(new Paginator('emoji-requests/list', {
	limit: 10,
}));

function onFileSelectClicked() {
	chooseFileFromPcAndUpload({
		multiple: false,
	}).then(files => {
		if (files[0]) file.value = files[0];
	});
}

function onDriveSelectClicked() {
	chooseDriveFile({
		multiple: false,
	}).then(files => {
		if (files[0]) file.value = files[0];
	});
}

function submit() {
	if (file.value == null || !name.value) return;

	os.apiWithDialog('emoji-requests/create', {
		fileId: file.value.id,
		name: name.value,
		category: category.value || null,
		license: license.value || null,
		deleteFileAfterReview: deleteFileAfterReview.value,
	}).then(request => {
		paginator.prepend(request);
		file.value = null;
		name.value = '';
		category.value = '';
		license.value = '';
		deleteFileAfterReview.value = false;
		tab.value = 'list';
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => [{
	key: 'form',
	title: i18n.ts._emojiRequest.newRequest,
	icon: 'ti ti-plus',
}, {
	key: 'list',
	title: i18n.ts._emojiRequest.myRequests,
	icon: 'ti ti-list',
}]);

definePage(() => ({
	title: i18n.ts._juice.emojiRequest,
	icon: 'ti ti-mood-plus',
}));
</script>

<style lang="scss" module>
.filePreview {
	display: flex;
	align-items: center;
	gap: 12px;
}

.fileImg {
	width: 64px;
	height: 64px;
	object-fit: contain;
	border-radius: 6px;
	background: var(--MI_THEME-panel);
}
</style>
