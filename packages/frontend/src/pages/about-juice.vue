<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div style="overflow: clip;">
		<div class="_spacer" style="--MI_SPACER-w: 600px; --MI_SPACER-min: 20px;">
			<div class="_gaps_m">
				<div v-panel :class="$style.banner">
					<i class="ti ti-droplet" :class="$style.bannerIcon"></i>
					<div :class="$style.bannerName">misskey-juice</div>
					<div :class="$style.bannerVersion">v{{ version }}</div>
				</div>

				<MkKeyValue>
					<template #key>{{ i18n.ts._aboutJuice.description }}</template>
					<template #value>{{ i18n.ts._aboutJuice.descriptionText }}</template>
				</MkKeyValue>

				<FormSection>
					<template #label>{{ i18n.ts._aboutJuice.developer }}</template>
					<div class="_gaps_s">
						<FormLink to="https://github.com/Zel9278" external>
							<template #icon><i class="ti ti-user"></i></template>
							c30 (Zel9278)
							<template #suffix>GitHub</template>
						</FormLink>
					</div>
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
import { computed } from 'vue';
import { version } from '@@/js/config.js';
import FormLink from '@/components/form/link.vue';
import FormSection from '@/components/form/section.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

const features = [
	{ icon: 'ti ti-user-check', text: i18n.ts._aboutJuice._features.approvalSignup },
	{ icon: 'ti ti-sparkles', text: i18n.ts._aboutJuice._features.aiGenerated },
	{ icon: 'ti ti-mood-plus', text: i18n.ts._aboutJuice._features.emojiRequest },
	{ icon: 'ti ti-trophy', text: i18n.ts._aboutJuice._features.ranking },
	{ icon: 'ti ti-broadcast', text: i18n.ts._aboutJuice._features.relayTimeline },
	{ icon: 'ti ti-language', text: i18n.ts._aboutJuice._features.emailI18n },
];

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._aboutJuice.title,
	icon: 'ti ti-droplet',
}));
</script>

<style lang="scss" module>
.banner {
	position: relative;
	border-radius: var(--MI-radius);
	padding: 32px 16px;
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
}

.bannerIcon {
	font-size: 48px;
	line-height: 1;
	color: var(--MI_THEME-accent);
}

.bannerName {
	margin-top: 0.5em;
	font-weight: bold;
	font-size: 1.2em;
}

.bannerVersion {
	opacity: 0.5;
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
