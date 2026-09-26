<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- JUICE: 小説エディターの投稿前のチェック。別ウインドウで開いたまま書くと、そのまま結果が変わる。
項目を押すと、エディターのその行へ移る -->
<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 600px;">
		<div class="_gaps_s">
			<div :class="$style.workTitle">{{ currentWork.title || i18n.ts._juice.novelEditorUntitled }}</div>
			<MkResult v-if="issues.length === 0" type="empty" :text="i18n.ts._juice.novelEditorCheckOk"/>
			<button v-for="(issue, i) in issues" :key="i" class="_button _panel" :class="$style.issue" @click="requestNovelEditorJump(issue.line)">
				<i class="ti ti-alert-triangle" :class="$style.issueIcon"></i>
				<span :class="$style.issueText">{{ novelCheckIssueText(issue) }}</span>
				<i class="ti ti-chevron-right" :class="$style.issueGo"></i>
			</button>
			<div :class="$style.caption">{{ i18n.ts._juice.novelEditorCheckCaption }}</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { onUnmounted, ref, watch } from 'vue';
import type { NovelCheckIssue } from '@/utility/novel-draft.js';
import MkResult from '@/components/global/MkResult.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { currentWork, checkNovelText, novelCheckIssueText, requestNovelEditorJump } from '@/utility/novel-draft.js';

// 打つたびに調べ直すと長編で重いので、少し待ってから調べる
const issues = ref<NovelCheckIssue[]>(checkNovelText(currentWork.value.text));
let timer: number | null = null;
watch(() => currentWork.value.text, (text) => {
	if (timer != null) window.clearTimeout(timer);
	timer = window.setTimeout(() => {
		timer = null;
		issues.value = checkNovelText(text);
	}, 500);
});

onUnmounted(() => {
	if (timer != null) window.clearTimeout(timer);
});

definePage(() => ({
	title: i18n.ts._juice.novelEditorCheck,
	icon: 'ti ti-checklist',
}));
</script>

<style lang="scss" module>
.workTitle {
	font-weight: bold;
}

.issue {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 14px;
	text-align: left;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.issueIcon {
	flex-shrink: 0;
	color: var(--MI_THEME-warn);
}

.issueText {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

.issueGo {
	flex-shrink: 0;
	opacity: 0.5;
}

.caption {
	font-size: 0.85em;
	opacity: 0.7;
}
</style>
