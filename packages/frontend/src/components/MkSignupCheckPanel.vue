<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Transition
	:enterActiveClass="prefer.s.animation ? $style.transition_x_enterActive : ''"
	:leaveActiveClass="prefer.s.animation ? $style.transition_x_leaveActive : ''"
	:enterFromClass="prefer.s.animation ? $style.transition_x_enterFrom : ''"
	:leaveToClass="prefer.s.animation ? $style.transition_x_leaveTo : ''"
	:duration="300" appear @afterLeave="emit('closed')"
>
	<div v-show="showing" :class="$style.root" :style="{ zIndex }">
		<div :class="$style.bg" :style="{ zIndex }" @click="close()"></div>
		<div :class="$style.content" :style="{ zIndex }">
			<div :class="$style.header">
				<button :class="$style.close" class="_button" @click="close()"><i class="ti ti-x"></i></button>
				<div :class="$style.title">{{ i18n.ts._signupCheck.title }}</div>
				<div :class="$style.spacer"></div>
			</div>
			<div :class="$style.body">
				<MkSignupCheckForm/>
			</div>
		</div>
	</div>
</Transition>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import MkSignupCheckForm from '@/components/MkSignupCheckForm.vue';
import { i18n } from '@/i18n.js';
import { claimZIndex } from '@/os.js';
import { prefer } from '@/preferences.js';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const zIndex = claimZIndex('high');
const showing = ref(true);

function close() {
	showing.value = false;
}
</script>

<style lang="scss" module>
.transition_x_enterActive,
.transition_x_leaveActive {
	> .bg {
		transition: opacity 0.3s !important;
	}

	> .content {
		transition: transform 0.3s cubic-bezier(0,0,.25,1) !important;
	}
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	> .bg {
		opacity: 0;
	}

	> .content {
		pointer-events: none;
		transform: translateX(100%);
	}
}

.root {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	overflow: clip;
}

.bg {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background: var(--MI_THEME-modalBg);
}

.content {
	position: fixed;
	top: 0;
	right: 0;
	bottom: 0;
	width: 100%;
	max-width: 480px;
	box-sizing: border-box;
	padding-bottom: env(safe-area-inset-bottom, 0px);
	background: var(--MI_THEME-bg);
	box-shadow: 0px 4px 32px var(--MI_THEME-shadow);
	overflow: auto;
	overscroll-behavior: contain;

	// 幅の狭い画面(スマホ等)では、サイドパネルではなく全画面表示にする
	@media (max-width: 500px) {
		max-width: 100%;
	}
}

.header {
	--height: 48px;

	position: sticky;
	top: 0;
	left: 0;
	height: var(--height);
	z-index: 1;
	display: flex;
	align-items: center;
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.75);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	border-bottom: solid 0.5px var(--MI_THEME-divider);
}

.close {
	display: flex;
	align-items: center;
	justify-content: center;
	width: var(--height);
	height: var(--height);
	font-size: 16px;
	color: var(--MI_THEME-accent);
}

.title {
	margin: 0 auto;
	white-space: nowrap;
	text-overflow: ellipsis;
	overflow: hidden;
}

.spacer {
	width: var(--height);
	height: var(--height);
}

.body {
	padding: 24px;
}
</style>
