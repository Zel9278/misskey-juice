<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="MkFormulaCore" v-if="enabled" :formula="formula" :block="block"/>
<code v-else>{{ formula }}</code>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, ref, onMounted } from 'vue';
import { fetchJuiceLatexEnabled } from '@/utility/juice-latex.js';

defineProps<{
	formula: string;
	block: boolean;
}>();

const MkFormulaCore = defineAsyncComponent(() => import('@/components/MkFormulaCore.vue'));

// 設定取得までは(無効時と同じ)生のTeXソースをcodeで表示しておく。
const enabled = ref(false);

onMounted(async () => {
	enabled.value = await fetchJuiceLatexEnabled();
});
</script>
