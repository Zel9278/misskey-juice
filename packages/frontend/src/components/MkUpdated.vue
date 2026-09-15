<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" preferType="dialog" :zPriority="'middle'" @click="modal?.close()" @closed="emit('closed')">
	<div :class="$style.root">
		<!-- JUICE: 本家の「Misskeyが更新されました！」から、JUICE独自の文言・バージョン表示に変更 -->
		<div :class="$style.title"><MkSparkle>{{ i18n.ts._juice.misskeyJuiceUpdated }}✨</MkSparkle></div>
		<div :class="$style.version">
			<div :class="$style.versionLine">
				<img src="/client-assets/about-icon.png" alt="" :class="$style.versionIconImg"/>
				<span>Misskey {{ misskeyVersion }}</span>
			</div>
			<div v-if="juiceVersion != null" :class="$style.versionLine">
				<span :class="$style.versionIconEmoji" aria-hidden="true">🧃</span>
				<span>Juice {{ juiceVersion }}</span>
			</div>
		</div>
		<div v-if="isBeta" :class="$style.beta">{{ i18n.ts.thankYouForTestingBeta }}</div>
		<MkButton full @click="whatIsNew">{{ i18n.ts.whatIsNew }}</MkButton>
		<MkButton :class="$style.gotIt" primary full @click="modal?.close()">{{ i18n.ts.gotIt }}</MkButton>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { onMounted, useTemplateRef } from 'vue';
import { version, misskeyVersion, juiceVersion } from '@@/js/config.js';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import MkSparkle from '@/components/MkSparkle.vue';
import { i18n } from '@/i18n.js';
import { confetti } from '@/utility/confetti.js';

const modal = useTemplateRef('modal');

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const isBeta = version.includes('-beta') || version.includes('-alpha') || version.includes('-rc');

// JUICE: 「更新情報を見る」の遷移先を、本家Misskeyのリリースノート
// (misskey-hub.net / misskey-dev/misskey GitHub Releases)ではなく、
// JUICE独自のCHANGELOGへ変更する。このダイアログ自体がJUICE単独のバージョン更新でも
// 表示されるようになったため、本家側のリリースノートへ飛ばしても意味が無い
function whatIsNew() {
	modal.value?.close();
	window.open('https://docs.mk-juice.dev/juice/changelog', '_blank');
}

onMounted(() => {
	confetti({
		duration: 1000 * 3,
	});
});
</script>

<style lang="scss" module>
.root {
	margin: auto;
	position: relative;
	padding: 32px;
	min-width: 320px;
	max-width: 480px;
	box-sizing: border-box;
	text-align: center;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.title {
	font-weight: bold;
}

.version {
	margin: 1em 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
}

// JUICE: 各行はアイコン(左)+テキストのペアとして横並びにしつつ、
// ダイアログ全体の中央揃えは.versionのalign-itemsで担う(inline-flexなのでこの行自体は
// 中央に置かれ、行の中ではアイコンが常に左に来る)
.versionLine {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.versionIconImg {
	width: 1.25em;
	height: 1.25em;
	flex-shrink: 0;
	border-radius: 4px;
}

.versionIconEmoji {
	flex-shrink: 0;
	font-size: 1.25em;
	line-height: 1;
}

.beta {
	margin: 1em 0;
}

.gotIt {
	margin: 8px 0 0 0;
}
</style>
