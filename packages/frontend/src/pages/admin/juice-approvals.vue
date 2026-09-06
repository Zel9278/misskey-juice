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

			<template v-if="state === 'pending'">
				<MkInfo v-if="pendingPaginator.items.value.length === 0 && !pendingPaginator.fetching.value">{{ i18n.ts._juiceApprovals.noPendingSignups }}</MkInfo>
				<MkPagination v-slot="{items}" :paginator="pendingPaginator">
					<div class="_gaps">
						<MkJuiceSignupApproval v-for="signup in items" :key="signup.id" :signup="signup" @resolved="resolved"/>
					</div>
				</MkPagination>
			</template>
			<template v-else>
				<MkInfo v-if="historyPaginator.items.value.length === 0 && !historyPaginator.fetching.value">{{ i18n.ts._juiceApprovals.noHistory }}</MkInfo>
				<MkPagination v-slot="{items}" :paginator="historyPaginator">
					<div class="_gaps">
						<MkJuiceSignupHistoryItem v-for="entry in items" :key="entry.id" :entry="entry"/>
					</div>
				</MkPagination>
			</template>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkJuiceSignupApproval from '@/components/MkJuiceSignupApproval.vue';
import MkJuiceSignupHistoryItem from '@/components/MkJuiceSignupHistoryItem.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import { Paginator } from '@/utility/paginator.js';

const {
	model: state,
	def: stateDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts._juiceApprovals.statusPending, value: 'pending' },
		{ label: i18n.ts._juiceApprovals.statusApproved, value: 'approved' },
		{ label: i18n.ts._juiceApprovals.statusDeclined, value: 'declined' },
	],
	initialValue: 'pending',
});

// JUICE: 審査待ち(pending)は実在するuser行を対象に承認/却下操作を行うため、
// 履歴(承認済み/却下済み)とは別のエンドポイント・別のPaginatorを使う
const pendingPaginator = markRaw(new Paginator('admin/juice/pending-signups', {
	limit: 10,
}));

const historyPaginator = markRaw(new Paginator('admin/juice/signup-approval-history', {
	limit: 10,
	// state==='pending'のときはこのPaginatorのMkPaginationが描画されないため実際にはfetchされないが、
	// computedParamsの型としては'approved'|'declined'のみを渡す必要があるためフォールバックしておく
	computedParams: computed(() => ({
		state: (state.value === 'declined' ? 'declined' : 'approved') as 'approved' | 'declined',
	})),
}));

function resolved(userId: string) {
	pendingPaginator.removeItem(userId);
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._juiceApprovals.title,
	icon: 'ti ti-user-question',
}));
</script>
