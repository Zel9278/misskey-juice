<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XColumn :menu="menu" :column="column" :isStacked="isStacked" :refresher="async () => { await timeline?.reloadTimeline() }">
	<template #header>
		<i v-if="column.tl && isBasicTimeline(column.tl)" :class="basicTimelineIconClass(column.tl)"></i>
		<i v-else-if="column.tl === 'relay'" class="ti ti-broadcast"></i>
		<i v-else-if="column.tl === 'media'" class="ti ti-photo"></i>
		<span style="margin-left: 8px;">{{ column.name || headerLabel || i18n.ts._deck._columns.tl }}</span>
		<span v-if="column.tl === 'relay' || column.tl === 'media'" class="_juice">JUICE</span>
	</template>

	<div v-if="!isAvailable" :class="$style.disabled">
		<p :class="$style.disabledTitle">
			<i class="ti ti-circle-minus"></i>
			{{ i18n.ts._disabledTimeline.title }}
		</p>
		<p :class="$style.disabledDescription">{{ i18n.ts._disabledTimeline.description }}</p>
	</div>
	<MkStreamingNotesTimeline
		v-else-if="column.tl === 'relay'"
		ref="timeline"
		key="relay"
		src="relay"
		:relays="column.relayIds && column.relayIds.length > 0 ? column.relayIds : undefined"
		:withRenotes="withRenotes"
		:withSensitive="withSensitive"
		:onlyFiles="onlyFiles"
		:sound="true"
		:customSound="soundSetting"
	/>
	<MkStreamingNotesTimeline
		v-else-if="column.tl === 'media'"
		ref="timeline"
		:key="'media' + mediaSrc"
		:src="mediaSrc"
		:withRenotes="withRenotes"
		:withReplies="false"
		:withSensitive="withSensitive"
		:onlyFiles="true"
		:pixelfedMode="true"
		:sound="true"
		:customSound="soundSetting"
	/>
	<MkStreamingNotesTimeline
		v-else-if="column.tl"
		ref="timeline"
		:key="column.tl + withRenotes + withReplies + onlyFiles + localOnly"
		:src="column.tl"
		:withRenotes="withRenotes"
		:withReplies="withReplies"
		:withSensitive="withSensitive"
		:onlyFiles="onlyFiles"
		:localOnly="localOnly"
		:sound="true"
		:customSound="soundSetting"
	/>
</XColumn>
</template>

<script lang="ts" setup>
import { onMounted, watch, ref, useTemplateRef, computed } from 'vue';
import * as Misskey from 'misskey-js';
import XColumn from './column.vue';
import type { Column } from '@/deck.js';
import type { MenuItem } from '@/types/menu.js';
import type { SoundStore } from '@/preferences/def.js';
import type { BasicTimelineType } from '@/timelines.js';
import { removeColumn, updateColumn } from '@/deck.js';
import MkStreamingNotesTimeline from '@/components/MkStreamingNotesTimeline.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { instance } from '@/instance.js';
import { juicePublicSettingsCache, juiceRelaysCache } from '@/cache.js';
import { availableBasicTimelines, hasWithReplies, isAvailableBasicTimeline, isBasicTimeline, basicTimelineIconClass } from '@/timelines.js';
import { soundSettingsButton } from '@/ui/deck/tl-note-notification.js';
import { langs } from '@@/js/config.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{
	column: Column;
	isStacked: boolean;
}>();

const timeline = useTemplateRef('timeline');

const soundSetting = ref<SoundStore>(props.column.soundSetting ?? { type: null, volume: 1 });
const withRenotes = ref(props.column.withRenotes ?? true);
const withReplies = ref(props.column.withReplies ?? false);
const withSensitive = ref(props.column.withSensitive ?? true);
const onlyFiles = ref(props.column.onlyFiles ?? false);
// JUICE: ホームタイムラインをローカルユーザーの投稿だけに絞り込む(カラムごとに独立して選べる)
const localOnly = ref(props.column.localOnly ?? false);

// JUICE: リレー/メディアタイムラインをタイムラインカラムの種別として選べるように追加。
// サーバー側で機能自体が無効化されている場合は選択肢に出さず、選択済みでも無効表示にする(timeline.vueと同じ判定)
const relayTimelineEnabled = ref(false);
const relayTimelineAvailable = computed(() => relayTimelineEnabled.value && ($i != null ? $i.policies.gtlAvailable : instance.policies.gtlAvailable));
const mediaTimelineEnabled = ref(false);
const mediaTimelineAvailable = computed(() => mediaTimelineEnabled.value);
const relays = ref<Misskey.entities.JuiceRelaysResponse>([]);

// JUICE: リレー/メディアタイムラインの利用可否は非同期取得のため、setType()側でも
// (onMountedでの自動プロンプト等、この取得が終わる前に選択肢を組み立てようとするタイミングに備えて)
// 明示的にawaitしてから選択肢を組み立てる。juicePublicSettingsCacheはキャッシュ済みなら
// 即座に解決するため、複数箇所から呼んでも問題ない
async function loadJuiceTimelineAvailability() {
	const res = await juicePublicSettingsCache.fetch();
	relayTimelineEnabled.value = res.relayTimelineEnabled;
	mediaTimelineEnabled.value = res.mediaTimelineEnabled;
	if (relayTimelineAvailable.value && relays.value.length === 0) {
		relays.value = await juiceRelaysCache.fetch();
	}
}

loadJuiceTimelineAvailability();

// JUICE: メディアタイムラインが対象とするタイムライン範囲(ホーム/ローカル/ソーシャル/グローバル)。カラムごとに独立して選べる
const mediaSrc = computed<BasicTimelineType>(() => {
	const stored = props.column.mediaTimelineSrc;
	return stored && isAvailableBasicTimeline(stored) ? stored : availableBasicTimelines()[0];
});
const mediaSrcRef = computed<BasicTimelineType>({
	get: () => mediaSrc.value,
	set: (v) => updateColumn(props.column.id, { mediaTimelineSrc: v }),
});

const isAvailable = computed(() => {
	const tl = props.column.tl;
	if (tl == null) return false;
	if (tl === 'relay') return relayTimelineAvailable.value;
	if (tl === 'media') return mediaTimelineAvailable.value && isAvailableBasicTimeline(mediaSrc.value);
	return isAvailableBasicTimeline(tl);
});

const headerLabel = computed(() => {
	const tl = props.column.tl;
	if (tl == null) return null;
	if (tl === 'relay') return i18n.ts._juice.relayTimeline;
	if (tl === 'media') return i18n.ts._juice.mediaTimeline;
	return i18n.ts._timelines[tl];
});

watch(withRenotes, v => {
	updateColumn(props.column.id, {
		withRenotes: v,
	});
});

watch(withReplies, v => {
	updateColumn(props.column.id, {
		withReplies: v,
	});
});

watch(withSensitive, v => {
	updateColumn(props.column.id, {
		withSensitive: v,
	});
});

watch(onlyFiles, v => {
	updateColumn(props.column.id, {
		onlyFiles: v,
	});
});

watch(localOnly, v => {
	updateColumn(props.column.id, {
		localOnly: v,
	});
});

watch(soundSetting, v => {
	updateColumn(props.column.id, { soundSetting: v });
});

onMounted(() => {
	if (props.column.tl == null) {
		setType();
	}
});

function relaySelectedRef(id: string) {
	return computed<boolean>({
		get: () => (props.column.relayIds ?? []).includes(id),
		set: (checked) => updateColumn(props.column.id, {
			relayIds: checked
				? [...(props.column.relayIds ?? []), id]
				: (props.column.relayIds ?? []).filter(x => x !== id),
		}),
	});
}

// JUICE: タイムラインに表示する言語の絞り込み。アカウント単位の設定のためカラム間で共有される
// (timeline.vueと同じくi/updateへ保存し、meUpdatedストリームイベント経由で反映される)
function filteredLanguageSelectedRef(code: string) {
	return computed<boolean>({
		get: () => $i != null && $i.filteredLanguages.includes(code),
		set: (checked) => {
			if ($i == null) return;
			misskeyApi('i/update', {
				filteredLanguages: checked
					? [...$i.filteredLanguages, code]
					: $i.filteredLanguages.filter(x => x !== code),
			});
		},
	});
}

const filteredLanguageRefs = new Map(langs.map(([code]) => [code, filteredLanguageSelectedRef(code)]));

// JUICE: 表示言語の絞り込みが有効な場合でも、自分自身の投稿を常に表示するか
const excludeOwnNotesFromLanguageFilterRef = computed<boolean>({
	get: () => $i != null && $i.excludeOwnNotesFromLanguageFilter,
	set: (checked) => {
		if ($i == null) return;
		misskeyApi('i/update', {
			excludeOwnNotesFromLanguageFilter: checked,
		});
	},
});

async function setType() {
	// JUICE: リレー/メディアタイムラインの利用可否取得が完了する前に選択肢を組み立ててしまい、
	// 本来選べるはずなのに一覧に出てこないことがあるため、必ず取得完了を待ってから組み立てる
	await loadJuiceTimelineAvailability();

	const { canceled, result: src } = await os.select({
		title: i18n.ts.timeline,
		items: [{
			value: 'home', label: i18n.ts._timelines.home,
		}, {
			value: 'local', label: i18n.ts._timelines.local,
		}, {
			value: 'social', label: i18n.ts._timelines.social,
		}, {
			value: 'global', label: i18n.ts._timelines.global,
		},
		...(relayTimelineAvailable.value ? [{ value: 'relay', label: i18n.ts._juice.relayTimeline, badge: true }] : []),
		...(mediaTimelineAvailable.value ? [{ value: 'media', label: i18n.ts._juice.mediaTimeline, badge: true }] : []),
		] as { value: NonNullable<Column['tl']>, label: string, badge?: boolean }[],
		default: props.column.tl,
	});
	if (canceled) {
		if (props.column.tl == null) {
			removeColumn(props.column.id);
		}
		return;
	}
	if (src == null) return;
	updateColumn(props.column.id, {
		tl: src ?? undefined,
	});
}

const menu = computed<MenuItem[]>(() => {
	const tl = props.column.tl;
	const menuItems: MenuItem[] = [];

	menuItems.push({
		icon: 'ti ti-pencil',
		text: i18n.ts.timeline,
		action: setType,
	}, {
		icon: 'ti ti-bell',
		text: i18n.ts._deck.newNoteNotificationSettings,
		action: () => soundSettingsButton(soundSetting),
	}, {
		type: 'switch',
		text: i18n.ts.showRenotes,
		ref: withRenotes,
	});

	if (tl === 'relay') {
		// JUICE: リレーTL表示中のみ、絞り込み先リレーを選べるようにする(複数選択可、未選択=すべてのリレーを表示)
		if (relays.value.length > 0) {
			menuItems.push({
				type: 'parent',
				icon: 'ti ti-broadcast',
				text: i18n.ts._juice.relayTimelineFilter,
				badge: true,
				children: () => relays.value.map(relay => ({
					type: 'switch',
					text: relay.host,
					ref: relaySelectedRef(relay.id),
				})),
			});
		}
	} else if (tl === 'media') {
		// JUICE: メディアタイムライン表示中のみ、対象とするタイムライン範囲を選べるようにする
		menuItems.push({
			type: 'radio',
			icon: 'ti ti-list-search',
			text: i18n.ts._juice.mediaTimelineSrc,
			ref: mediaSrcRef,
			badge: true,
			options: availableBasicTimelines().map(t => ({
				label: i18n.ts._timelines[t],
				value: t,
			})),
		});
	} else {
		if (hasWithReplies(tl)) {
			menuItems.push({
				type: 'switch',
				text: i18n.ts.showRepliesToOthersInTimeline,
				ref: withReplies,
				disabled: onlyFiles,
			});
		}

		menuItems.push({
			type: 'switch',
			text: i18n.ts.fileAttachedOnly,
			ref: onlyFiles,
			disabled: hasWithReplies(tl) ? withReplies : false,
		});

		// JUICE: ホームタイムラインをローカルユーザーの投稿だけに絞り込む(すでに全ローカルを見せるlocal/socialでは意味が無いためhomeのみ)
		if (tl === 'home') {
			menuItems.push({
				type: 'switch',
				icon: 'ti ti-planet',
				text: i18n.ts._juice.localOnlyInHomeTimeline,
				ref: localOnly,
				badge: true,
			});
		}
	}

	// JUICE: 表示する投稿を言語で絞り込む(未選択=すべての言語を表示、言語未指定の投稿は常に表示)。
	// アカウント単位の設定のため、カラムの種別を問わず表示する
	if ($i) {
		menuItems.push({
			type: 'parent',
			icon: 'ti ti-language',
			text: i18n.ts._juice.filteredLanguages,
			badge: true,
			children: () => [{
				type: 'switch',
				text: i18n.ts._juice.excludeOwnNotesFromLanguageFilter,
				ref: excludeOwnNotesFromLanguageFilterRef,
			}, ...langs.map(([code, label]) => ({
				type: 'switch' as const,
				text: label,
				ref: filteredLanguageRefs.get(code)!,
			}))],
		});
	}

	menuItems.push({
		type: 'switch',
		text: i18n.ts.withSensitive,
		ref: withSensitive,
	});

	return menuItems;
});
</script>

<style lang="scss" module>
.disabled {
	text-align: center;
}

.disabledTitle {
	margin: 16px;
}

.disabledDescription {
	font-size: 90%;
}
</style>
