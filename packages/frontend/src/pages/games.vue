<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div class="_gaps">
			<div class="_panel" :class="$style.link">
				<MkA to="/bubble-game">
					<img src="/client-assets/drop-and-fusion/logo.png" style="display: block; max-width: 100%; max-height: 200px; margin: auto;"/>
				</MkA>
			</div>
			<div class="_panel" :class="$style.link">
				<MkA to="/reversi">
					<img src="/client-assets/reversi/logo.png" style="display: block; max-width: 100%; max-height: 200px; margin: auto;"/>
				</MkA>
			</div>
			<!-- JUICE: 盆栽を育てるゲーム。専用ロゴ画像は用意していないため絵文字で代用する -->
			<div class="_panel" :class="$style.link">
				<MkA to="/bonsai" :class="$style.gameLink">
					<span :class="$style.gameEmoji">🪴</span>
					<span>{{ i18n.ts._bonsai.title }}<span class="_juice">JUICE</span></span>
				</MkA>
			</div>
			<!-- JUICE: 絵チャ(お絵かきチャット)。ゲームではないが、みんなで遊ぶ場所としてここにも入口を置く -->
			<div v-if="$i != null && drawRoomEnabled" class="_panel" :class="$style.link">
				<MkA to="/draw" :class="$style.gameLink">
					<span :class="$style.gameEmoji">🎨</span>
					<span>{{ i18n.ts._drawRoom.title }}<span class="_juice">JUICE</span></span>
				</MkA>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { $i } from '@/i.js';
import { juicePublicSettingsCache } from '@/cache.js';

const drawRoomEnabled = computed(() => juicePublicSettingsCache.value.value?.drawRoomEnabled ?? true);
juicePublicSettingsCache.fetch();

definePage(() => ({
	title: 'Misskey Games',
	icon: 'ti ti-device-gamepad',
}));
</script>

<style module>
.link:focus-within {
	outline: 2px solid var(--MI_THEME-focus);
	outline-offset: -2px;
}

.gameLink {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 20px 0;
}

.gameEmoji {
	font-size: 96px;
	line-height: 1.2;
}
</style>
