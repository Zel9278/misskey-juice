<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div class="_gaps">
			<MkInfo v-if="paginator.items.value.length === 0 && !paginator.fetching.value">{{ i18n.ts._emojiRequestApprovals.noPendingRequests }}</MkInfo>
			<MkPagination v-slot="{items}" :paginator="paginator">
				<div class="_gaps">
					<MkEmojiRequestApproval v-for="request in items" :key="request.id" :request="request" @resolved="resolved"/>
				</div>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import MkInfo from '@/components/MkInfo.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkEmojiRequestApproval from '@/components/MkEmojiRequestApproval.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { Paginator } from '@/utility/paginator.js';

const paginator = markRaw(new Paginator('admin/emoji-requests/list', {
	limit: 10,
	params: {
		state: 'pending',
	},
}));

function resolved(requestId: string) {
	paginator.removeItem(requestId);
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._emojiRequestApprovals.title,
	icon: 'ti ti-mood-plus',
}));
</script>
