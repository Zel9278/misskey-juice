<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div style="overflow: clip;">
		<div class="_spacer" style="--MI_SPACER-w: 600px; --MI_SPACER-min: 20px;">
			<div class="_gaps_m">
				<div v-panel :class="$style.banner" :style="{ '--rain-angle': `${rainAngle}deg` }">
					<img
						src="/client-assets/juice-icon-transparent.png" alt=""
						:class="$style.bannerIcon" draggable="false"
						role="button" tabindex="0"
						@click="startRain"
						@keydown.enter="startRain"
						@keydown.space.prevent="startRain"
					/>
					<div :class="$style.bannerName">misskey-juice</div>
					<div :class="$style.bannerVersion">v{{ version }}</div>
					<span
						v-for="drop in rainDrops"
						:key="drop.id"
						:class="$style.rainDrop"
						:style="{ left: `${drop.left}%`, animationDelay: `${drop.delay}s`, animationDuration: `${drop.duration}s` }"
					></span>
				</div>

				<MkKeyValue>
					<template #key>{{ i18n.ts._aboutJuice.description }}</template>
					<template #value>{{ i18n.ts._aboutJuice.descriptionText }}</template>
				</MkKeyValue>

				<FormSection>
					<template #label>{{ i18n.ts._aboutJuice.developer }}</template>
					<a href="https://github.com/Zel9278" target="_blank" :class="$style.developer">
						<img src="https://github.com/Zel9278.png" :class="$style.developerAvatar"/>
						<span :class="$style.developerName">c30 (Zel9278)</span>
					</a>
				</FormSection>

				<FormSection>
					<template #label>{{ i18n.ts._aboutJuice.sourceAndLicense }}</template>
					<div class="_gaps_s">
						<FormLink to="https://github.com/Zel9278/misskey-juice" external>
							<template #icon><i class="ti ti-code"></i></template>
							{{ i18n.ts._aboutMisskey.source }}
							<template #suffix>GitHub</template>
						</FormLink>
						<MkKeyValue>
							<template #key>{{ i18n.ts.license }}</template>
							<template #value>AGPL-3.0-only</template>
						</MkKeyValue>
					</div>
				</FormSection>

				<FormSection>
					<template #label>{{ i18n.ts._aboutJuice.inspiredBy }}</template>
					<div class="_gaps_s">
						<FormLink to="https://github.com/kokonect-link/cherrypick" external>
							<template #icon><i class="ti ti-bulb"></i></template>
							CherryPick
							<template #suffix>GitHub</template>
						</FormLink>
						<FormLink to="https://github.com/lqvp/misskey-tempura" external>
							<template #icon><i class="ti ti-bulb"></i></template>
							misskey-tempura
							<template #suffix>GitHub</template>
						</FormLink>
					</div>
				</FormSection>

				<FormSection>
					<template #label>{{ i18n.ts._aboutJuice.features }}</template>
					<div :class="$style.features">
						<div v-for="feature in features" :key="feature.text" :class="$style.feature">
							<i :class="[feature.icon, $style.featureIcon]"></i>
							<span>{{ feature.text }}</span>
						</div>
					</div>
				</FormSection>

				<FormLink to="/about-misskey">
					<template #icon><i class="ti ti-info-circle"></i></template>
					{{ i18n.ts.aboutMisskey }}
				</FormLink>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { version } from '@@/js/config.js';
import FormLink from '@/components/form/link.vue';
import FormSection from '@/components/form/section.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { claimAchievement } from '@/utility/achievements.js';

const features = [
	{ icon: 'ti ti-user-check', text: i18n.ts._aboutJuice._features.approvalSignup },
	{ icon: 'ti ti-sparkles', text: i18n.ts._aboutJuice._features.aiGenerated },
	{ icon: 'ti ti-mood-plus', text: i18n.ts._aboutJuice._features.emojiRequest },
	{ icon: 'ti ti-trophy', text: i18n.ts._aboutJuice._features.ranking },
	{ icon: 'ti ti-broadcast', text: i18n.ts._aboutJuice._features.relayTimeline },
	{ icon: 'ti ti-language', text: i18n.ts._aboutJuice._features.emailI18n },
	{ icon: 'ti ti-arrow-bar-to-left', text: i18n.ts._aboutJuice._features.widgetsSide },
	{ icon: 'ti ti-mood-happy', text: i18n.ts._aboutJuice._features.announcementReaction },
	{ icon: 'ti ti-list-check', text: i18n.ts._aboutJuice._features.announcementPoll },
	{ icon: 'ti ti-math-function', text: i18n.ts._aboutJuice._features.latex },
];

// JUICE: アイコンクリックでオレンジの雨が降るイースターエッグ
const RAIN_DROP_COUNT = 40;
// delay(最大0.4s)+duration(最大0.9s)より確実に長くする(アニメ完了前に消去されて欠けて見えるのを防ぐ)
const RAIN_DURATION_MS = 2000;
const RAIN_MAX_ANGLE = 25; // 度、左右にこの範囲でランダムに傾く

const rainDrops = ref<{ id: string; left: number; delay: number; duration: number }[]>([]);
const rainAngle = ref(0);
let rainTimeoutId: number | undefined;
// クリックのたびに要素を確実に再マウントさせてアニメーションを最初から再生させるためのバースト番号
let rainBurstId = 0;

function startRain() {
	claimAchievement('juiceRain');

	if (rainTimeoutId != null) window.clearTimeout(rainTimeoutId);

	rainAngle.value = (Math.random() * 2 - 1) * RAIN_MAX_ANGLE;
	rainBurstId++;

	rainDrops.value = Array.from({ length: RAIN_DROP_COUNT }, (_, i) => ({
		id: `${rainBurstId}-${i}`,
		left: Math.random() * 100,
		delay: Math.random() * 0.4,
		duration: 0.5 + Math.random() * 0.4,
	}));

	rainTimeoutId = window.setTimeout(() => {
		rainDrops.value = [];
		rainTimeoutId = undefined;
	}, RAIN_DURATION_MS);
}

onBeforeUnmount(() => {
	if (rainTimeoutId != null) window.clearTimeout(rainTimeoutId);
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._aboutJuice.title,
	icon: 'ti ti-droplet',
}));
</script>

<style lang="scss" module>
// JUICEブランドカラー(テーマの--MI_THEME-accent等はユーザー設定で変わるため、雨の色は固定にする)
$juice-rain-color: #f2841f;

.banner {
	position: relative;
	overflow: hidden;
	border-radius: var(--MI-radius);
	padding: 32px 16px;
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
}

.bannerIcon {
	width: 72px;
	height: 72px;
	position: relative;
	z-index: 1;
	cursor: pointer;
}

.bannerName {
	margin-top: 0.5em;
	font-weight: bold;
	font-size: 1.2em;
	position: relative;
	z-index: 1;
}

.bannerVersion {
	opacity: 0.5;
	position: relative;
	z-index: 1;
}

// JUICE: アイコンクリックで降らせるオレンジの雨(細い線)。--rain-angleはクリックのたびにランダムに変わる
.rainDrop {
	position: absolute;
	top: -100px;
	width: 2px;
	height: 90px;
	background: linear-gradient(to bottom, transparent, $juice-rain-color, transparent);
	pointer-events: none;
	animation-name: juiceRain;
	animation-timing-function: linear;
	animation-fill-mode: forwards;
}

@keyframes juiceRain {
	0% {
		transform: rotate(var(--rain-angle)) translateY(0);
		opacity: 0;
	}
	15% {
		opacity: 1;
	}
	100% {
		transform: rotate(var(--rain-angle)) translateY(340px);
		opacity: 0;
	}
}

.developer {
	display: flex;
	align-items: center;
	padding: 12px;
	background: var(--MI_THEME-buttonBg);
	border-radius: 8px;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.developerAvatar {
	width: 42px;
	height: 42px;
	border-radius: 100%;
}

.developerName {
	margin-left: 12px;
	font-weight: bold;
}

.features {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	grid-gap: 12px;
}

.feature {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px;
	background: var(--MI_THEME-buttonBg);
	border-radius: 8px;
	line-height: 1.4;
}

.featureIcon {
	flex-shrink: 0;
	font-size: 20px;
	color: var(--MI_THEME-accent);
}
</style>
