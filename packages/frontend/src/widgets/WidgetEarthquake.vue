<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" data-testid="mkw-earthquake" class="mkw-earthquake">
	<template #icon><i class="ti ti-activity"></i></template>
	<template #header>{{ i18n.ts._widgets.earthquake }}</template>
	<template #func="{ buttonStyleClass }"><button class="_button" :class="buttonStyleClass" @click="configure"><i class="ti ti-settings"></i></button></template>

	<div :class="$style.root">
		<MkLoading v-if="fetching"/>
		<MkResult v-else-if="error" type="error"/>
		<MkResult v-else-if="items.length === 0" type="empty"/>
		<div v-else :class="$style.list">
			<div v-for="item in items" :key="item.id" :class="$style.item">
				<span :class="$style.scale">{{ scaleToLabel(item.maxScale) }}</span>
				<div :class="$style.body">
					<div :class="$style.place">{{ item.place }}</div>
					<div :class="$style.detail">{{ item.time }} {{ item.magnitude != null ? i18n.tsx._widgetOptions._earthquake.magnitude({ m: item.magnitude }) : '' }}</div>
				</div>
			</div>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { ref, watch, computed } from 'vue';
import { useInterval } from '@@/js/use-interval.js';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import { i18n } from '@/i18n.js';
import MkContainer from '@/components/MkContainer.vue';

const name = 'earthquake';

const widgetPropsDef = {
	maxEntries: {
		type: 'number',
		label: i18n.ts._widgetOptions._earthquake.maxEntries,
		default: 5,
	},
	refreshIntervalSec: {
		type: 'number',
		label: i18n.ts._widgetOptions._earthquake.refreshIntervalSec,
		default: 60,
	},
	showHeader: {
		type: 'boolean',
		label: i18n.ts._widgetOptions.showHeader,
		default: true,
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

// JUICE: 地震情報ウィジェット。P2P地震情報(気象庁の情報を配信する無料コミュニティAPI、CORS許可済み)をブラウザから直接fetchする
type EarthquakeItem = {
	id: string;
	time: string;
	place: string;
	magnitude: number | null;
	maxScale: number | null;
};

type P2PQuakeHistoryItem = {
	id: string;
	earthquake?: {
		time?: string;
		maxScale?: number;
		hypocenter?: {
			name?: string;
			magnitude?: number;
		};
	};
};

const rawItems = ref<EarthquakeItem[]>([]);
const items = computed(() => rawItems.value.slice(0, widgetProps.maxEntries));
const fetching = ref(true);
const error = ref(false);
let intervalClear: (() => void) | null | undefined = null;

// P2P地震情報のmaxScaleはJMA震度階級を10倍した数値(気象庁の階級名に変換する)
function scaleToLabel(scale: number | null): string {
	const labels = i18n.ts._widgetOptions._earthquake._scales;
	if (scale == null || scale < 10) return labels.unknown;
	if (scale < 20) return labels.s1;
	if (scale < 30) return labels.s2;
	if (scale < 40) return labels.s3;
	if (scale < 45) return labels.s4;
	if (scale < 50) return labels.s5weak;
	if (scale < 55) return labels.s5strong;
	if (scale < 60) return labels.s6weak;
	if (scale < 70) return labels.s6strong;
	return labels.s7;
}

const tick = async () => {
	// JUICE: 定期更新のたびにMkLoadingへ差し替わってちらつかないよう、初回読み込み時のみローディング表示にする
	if (rawItems.value.length === 0) {
		fetching.value = true;
	}
	error.value = false;

	try {
		const limit = Math.max(1, Math.round(widgetProps.maxEntries));
		const res = await window.fetch(`https://api.p2pquake.net/v2/history?codes=551&limit=${limit}`);
		const data: unknown = await res.json();
		if (!Array.isArray(data)) throw new Error('unexpected response shape');

		rawItems.value = (data as P2PQuakeHistoryItem[]).map(x => ({
			id: x.id,
			time: x.earthquake?.time ?? '',
			place: x.earthquake?.hypocenter?.name ?? '',
			magnitude: (x.earthquake?.hypocenter?.magnitude ?? -1) >= 0 ? x.earthquake!.hypocenter!.magnitude! : null,
			maxScale: x.earthquake?.maxScale ?? null,
		}));
		fetching.value = false;
	} catch (_err) {
		error.value = true;
		fetching.value = false;
	}
};

watch(() => widgetProps.maxEntries, tick);
watch(() => widgetProps.refreshIntervalSec, () => {
	if (intervalClear != null) {
		intervalClear();
	}
	intervalClear = useInterval(tick, Math.max(30000, widgetProps.refreshIntervalSec * 1000), {
		immediate: true,
		afterMounted: true,
	});
}, { immediate: true });

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.root {
	padding: 0;
	font-size: 0.9em;
}

.list {
	padding: 0;
}

.item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 16px;

	&:nth-child(even) {
		background: rgba(#000, 0.05);
	}
}

.scale {
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 2.2em;
	padding: 2px 6px;
	border-radius: 6px;
	background: var(--MI_THEME-buttonBg);
	font-weight: bold;
}

.body {
	min-width: 0;
	flex: 1;
}

.place {
	white-space: nowrap;
	text-overflow: ellipsis;
	overflow: hidden;
}

.detail {
	font-size: 0.85em;
	opacity: 0.7;
	white-space: nowrap;
	text-overflow: ellipsis;
	overflow: hidden;
}
</style>
