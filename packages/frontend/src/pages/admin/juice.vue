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

				<MkButton primary @click="save">{{ i18n.ts.save }}</MkButton>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { langs } from '@@/js/config.js';
import MkFolder from '@/components/MkFolder.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
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
const defaultEmailLang = ref(settings.defaultEmailLang);

function save() {
	os.apiWithDialog('admin/juice/update-settings', {
		approvalRequiredForSignup: approvalRequiredForSignup.value,
		signupReasonRequired: signupReasonRequired.value,
		signupReasonMaxLength: signupReasonMaxLength.value,
		defaultEmailLang: defaultEmailLang.value,
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.juice,
	icon: 'ti ti-droplet',
}));
</script>
