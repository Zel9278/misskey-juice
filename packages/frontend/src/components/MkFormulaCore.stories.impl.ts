/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import MkFormulaCore from './MkFormulaCore.vue';
import type { StoryObj } from '@storybook/vue3';

export const Inline = {
	render(args) {
		return {
			components: { MkFormulaCore },
			setup() {
				return { args };
			},
			template: '<MkFormulaCore v-bind="args"/>',
		};
	},
	args: {
		formula: 'e^{i\\pi} + 1 = 0',
		block: false,
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkFormulaCore>;

export const Block = {
	...Inline,
	args: { ...Inline.args, block: true },
} satisfies StoryObj<typeof MkFormulaCore>;
