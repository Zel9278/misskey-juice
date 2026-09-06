<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div class="_gaps">
			<MkSelect v-model="state" :items="stateDef">
				<template #label>{{ i18n.ts.state }}</template>
			</MkSelect>
			<MkInfo v-if="paginator.items.value.length === 0 && !paginator.fetching.value">{{ state === 'pending' ? i18n.ts._avatarDecorationRequestApprovals.noPendingRequests : i18n.ts._avatarDecorationRequestApprovals.noRequests }}</MkInfo>
			<MkPagination v-slot="{items}" :paginator="paginator">
				<div class="_gaps">
					<MkAvatarDecorationRequestApproval v-for="request in items" :key="request.id" :request="request" @resolved="resolved"/>
				</div>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkAvatarDecorationRequestApproval from '@/components/MkAvatarDecorationRequestApproval.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import { Paginator } from '@/utility/paginator.js';

const {
	model: state,
	def: stateDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts._avatarDecorationRequestPage.statusPending, value: 'pending' },
		{ label: i18n.ts._avatarDecorationRequestPage.statusApproved, value: 'approved' },
		{ label: i18n.ts._avatarDecorationRequestPage.statusRejected, value: 'rejected' },
	],
	initialValue: 'pending',
});

const paginator = markRaw(new Paginator('admin/avatar-decoration-requests/list', {
	limit: 10,
	computedParams: computed(() => ({
		state: state.value,
	})),
}));

function resolved(requestId: string) {
	paginator.removeItem(requestId);
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._avatarDecorationRequestApprovals.title,
	icon: 'ti ti-sparkles',
}));
</script>
