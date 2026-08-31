<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 800px;">
	<div v-if="ranking" class="_gaps_m">
		<MkInfo>{{ i18n.tsx._juiceRanking.periodInfo({ hours: ranking.periodHours }) }}</MkInfo>

		<MkFoldableSection class="_margin" persistKey="explore-ranking-posts">
			<template #header><i class="ti ti-pencil ti-fw" style="margin-right: 0.5em;"></i>{{ i18n.ts._juiceRanking.posts }}</template>
			<div v-if="ranking.posts.length > 0" class="_gaps_s">
				<div v-for="(r, i) in ranking.posts" :key="r.user.id" :class="$style.rankingRecord">
					<span :class="$style.rank">{{ i + 1 }}</span>
					<MkAvatar :link="true" style="width: 32px; height: 32px; margin-right: 8px;" :user="r.user"/>
					<MkUserName :user="r.user" :nowrap="true"/>
					<b :class="$style.count">{{ r.count.toLocaleString() }}</b>
				</div>
			</div>
			<MkInfo v-else>{{ i18n.ts._juiceRanking.empty }}</MkInfo>
		</MkFoldableSection>

		<MkFoldableSection class="_margin" persistKey="explore-ranking-reactions">
			<template #header><i class="ti ti-mood-smile ti-fw" style="margin-right: 0.5em;"></i>{{ i18n.ts._juiceRanking.reactions }}</template>
			<div v-if="ranking.reactions.length > 0" class="_gaps_s">
				<div v-for="(r, i) in ranking.reactions" :key="r.user.id" :class="$style.rankingRecord">
					<span :class="$style.rank">{{ i + 1 }}</span>
					<MkAvatar :link="true" style="width: 32px; height: 32px; margin-right: 8px;" :user="r.user"/>
					<MkUserName :user="r.user" :nowrap="true"/>
					<b :class="$style.count">{{ r.count.toLocaleString() }}</b>
				</div>
			</div>
			<MkInfo v-else>{{ i18n.ts._juiceRanking.empty }}</MkInfo>
		</MkFoldableSection>
	</div>
	<MkLoading v-else/>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInfo from '@/components/MkInfo.vue';
import { misskeyApiGet } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';

const ranking = ref<Misskey.entities.JuiceRankingResponse | null>(null);

misskeyApiGet('juice/ranking', {}).then(res => {
	ranking.value = res;
});
</script>

<style lang="scss" module>
.rankingRecord {
	display: flex;
	align-items: center;
}

.rank {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	margin-right: 8px;
	font-weight: bold;
	opacity: 0.7;
}

.count {
	margin-left: auto;
}
</style>
