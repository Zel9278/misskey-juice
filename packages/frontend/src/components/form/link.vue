<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component
	:is="to ? 'div' : 'button'"
	:class="[
		$style.root,
		{
			[$style.inline]: inline,
			'_button': !to,
		},
	]"
>
	<component
		:is="to ? (external ? 'a' : 'MkA') : 'div'"
		:class="[$style.main, { [$style.active]: active }]"
		class="_button"
		v-bind="to ? (external ? { href: to, target: '_blank' } : { to, behavior }) : {}"
	>
		<span :class="$style.icon"><slot name="icon"></slot></span>
		<div :class="$style.headerText">
			<div>
				<MkCondensedLine :minScale="2 / 3"><slot></slot></MkCondensedLine>
			</div>
		</div>
		<span :class="$style.suffix">
			<span :class="$style.suffixText"><slot name="suffix"></slot></span>
			<i :class="to && external ? 'ti ti-external-link' : 'ti ti-chevron-right'"></i>
		</span>
	</component>
</component>
</template>

<script lang="ts" setup>
defineProps<{
	to?: string;
	active?: boolean;
	external?: boolean;
	behavior?: null | 'window' | 'browser';
	inline?: boolean;
}>();
</script>

<style lang="scss" module>
.root {
	display: block;
	width: 100%;

	&.inline {
		display: inline-block;
		width: auto;
	}
}

.main {
	display: flex;
	align-items: center;
	width: 100%;
	box-sizing: border-box;
	padding: 10px 14px;
	background: var(--MI_THEME-folderHeaderBg);
	border-radius: 6px;
	font-size: 0.9em;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-folderHeaderHoverBg);
	}

	&.active {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-folderHeaderHoverBg);
	}
}

.icon {
	margin-right: 0.75em;
	flex-shrink: 0;
	text-align: center;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);

	&:empty {
		display: none;

		& + .headerText {
			padding-left: 4px;
		}
	}
}

.headerText {
	white-space: nowrap;
	text-overflow: ellipsis;
	text-align: start;
	overflow: hidden;
	padding-right: 12px;

	// JUICE: 省略記号のためのoverflow: hiddenが、周囲のテキストより背の高いバッジ
	// (_juice/_beta/_modified、vertical-align: top等で行からはみ出す)の上端を切り取って
	// しまうため、この中でだけバッジがテキストの行に自然に収まるよう打ち消す
	:global(._juice),
	:global(._beta),
	:global(._modified) {
		vertical-align: baseline;
		transform: none;
	}
}

.suffix {
	margin-left: auto;
	opacity: 0.7;
	white-space: nowrap;

	> .suffixText:not(:empty) {
		margin-right: 0.75em;
	}
}
</style>
