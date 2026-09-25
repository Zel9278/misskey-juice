<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- JUICE: 絵チャの部屋一覧の1件 -->
<template>
<MkA :to="`/draw/${room.id}`" class="_panel" :class="$style.root">
	<MkAvatar :class="$style.avatar" :user="room.owner"/>
	<div :class="$style.body">
		<div :class="$style.title">{{ room.title }}</div>
		<div :class="$style.meta">
			<MkUserName :user="room.owner"/>
			<span><i :class="room.visibility === 'local' ? 'ti ti-world' : 'ti ti-lock'"></i> {{ room.visibility === 'local' ? i18n.ts._drawRoom.visibilityLocal : i18n.ts._drawRoom.visibilityFollowers }}</span>
			<span v-if="!room.isEnded"><i class="ti ti-users"></i> {{ i18n.tsx._drawRoom.membersCount({ n: room.members.length, max: room.maxMembers }) }}</span>
			<span v-else><i class="ti ti-archive"></i> <MkTime :time="room.endedAt ?? room.createdAt"/></span>
		</div>
	</div>
</MkA>
</template>

<script lang="ts" setup>
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';

defineProps<{
	room: Misskey.entities.DrawRoom;
}>();
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 16px;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-panelHighlight);
	}
}

.avatar {
	flex-shrink: 0;
	width: 42px;
	height: 42px;
}

.body {
	min-width: 0;
}

.title {
	font-weight: bold;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.meta {
	display: flex;
	flex-wrap: wrap;
	gap: 4px 12px;
	font-size: 0.85em;
	opacity: 0.8;
}
</style>
