<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 500px;">
		<div v-if="!ready" class="_gaps_m" :class="$style.root">
			<MkLoading/>
		</div>
		<div v-else class="_gaps_m" :class="$style.root">
			<div :class="$style.emoji">{{ STAGE_EMOJI[data.stage] }}</div>
			<div :class="$style.stageName">{{ stageNames[data.stage] }}</div>

			<div :class="$style.bar">
				<div :class="$style.barLabel">{{ i18n.ts._bonsai.health }} {{ data.health }}</div>
				<div :class="$style.barTrack"><div :class="$style.barFill" :style="{ width: `${data.health}%`, background: healthColor }"></div></div>
			</div>

			<div v-if="data.stage < STAGE_COUNT - 1" :class="$style.bar">
				<div :class="$style.barLabel">{{ i18n.ts._bonsai.growth }} {{ data.waterCount }} / {{ WATERINGS_PER_STAGE }}</div>
				<div :class="$style.barTrack"><div :class="$style.barFill" :style="{ width: `${(data.waterCount / WATERINGS_PER_STAGE) * 100}%` }"></div></div>
			</div>
			<div v-else :class="$style.flavor">{{ i18n.ts._bonsai.maxGrown }}</div>

			<MkButton primary rounded :disabled="!canWater" @click="onWater">
				<i class="ti ti-droplet"></i> {{ i18n.ts._bonsai.water }}
			</MkButton>
			<div v-if="!canWater" :class="$style.cooldown">{{ i18n.ts._bonsai.untilNextWatering }} {{ cooldownText }}</div>

			<div :class="$style.flavor">{{ flavorText }}</div>
			<div v-if="data.witherCount > 0" :class="$style.flavor">{{ i18n.tsx._bonsai.witherCount({ n: data.witherCount }) }}</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import * as bonsai from '@/utility/bonsai-game.js';
import { STAGE_COUNT, STAGE_EMOJI, WATERINGS_PER_STAGE } from '@/utility/bonsai-game.js';

const ready = bonsai.ready;
const data = computed(() => bonsai.saveData.value!);

const stageNames = computed(() => [
	i18n.ts._bonsai._stages.seed,
	i18n.ts._bonsai._stages.sprout,
	i18n.ts._bonsai._stages.sapling,
	i18n.ts._bonsai._stages.bonsai,
	i18n.ts._bonsai._stages.matureBonsai,
]);

// クールダウン表示をリアルタイムに更新するためのtick
const now = ref(Date.now());
let intervalId: number | undefined;

const canWater = computed(() => ready.value && bonsai.canWaterNow(data.value));

const cooldownText = computed(() => {
	void now.value; // reactivity trigger
	if (!ready.value) return '';
	const ms = bonsai.msUntilNextWatering(data.value);
	const h = Math.floor(ms / (60 * 60 * 1000));
	const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
	return `${h}${i18n.ts._time.hour}${m}${i18n.ts._time.minute}`;
});

const healthColor = computed(() => {
	if (!ready.value) return '';
	if (data.value.health >= 60) return 'var(--MI_THEME-success)';
	if (data.value.health >= 30) return 'var(--MI_THEME-warn)';
	return 'var(--MI_THEME-error)';
});

const flavorText = computed(() => {
	if (!ready.value) return '';
	if (data.value.health >= 80) return i18n.ts._bonsai.flavorThriving;
	if (data.value.health >= 50) return i18n.ts._bonsai.flavorGood;
	if (data.value.health >= 20) return i18n.ts._bonsai.flavorLow;
	return i18n.ts._bonsai.flavorDying;
});

function onWater() {
	bonsai.water();
}

onMounted(async () => {
	await bonsai.load();
	intervalId = window.setInterval(() => {
		now.value = Date.now();
	}, 1000 * 30);
});

onUnmounted(() => {
	if (intervalId != null) window.clearInterval(intervalId);
});

definePage(() => ({
	title: i18n.ts._bonsai.title,
	icon: 'ti ti-seeding',
}));
</script>

<style lang="scss" module>
.root {
	text-align: center;
}

.emoji {
	font-size: 96px;
	line-height: 1.2;
}

.stageName {
	font-weight: bold;
	font-size: 1.2em;
}

.bar {
	text-align: left;
}

.barLabel {
	font-size: 0.85em;
	opacity: 0.7;
	margin-bottom: 4px;
}

.barTrack {
	height: 10px;
	border-radius: 999px;
	background: var(--MI_THEME-divider);
	overflow: hidden;
}

.barFill {
	height: 100%;
	background: var(--MI_THEME-accent);
	transition: width 0.3s ease;
}

.cooldown {
	opacity: 0.7;
	font-size: 0.9em;
}

.flavor {
	opacity: 0.8;
}
</style>
