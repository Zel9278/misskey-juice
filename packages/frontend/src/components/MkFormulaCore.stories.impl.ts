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

// JUICE: `{`のネストが深すぎる数式はレンダリングせず、フォールバック表示(生のformulaをテキストとして表示)になる。
// ブラウザのタブがフリーズ・クラッシュしうる巨大なHTML生成を防ぐためのガード(MkFormulaCore.vue参照)
export const DeeplyNested = {
	...Inline,
	args: {
		...Inline.args,
		formula: '\\sqrt{'.repeat(50) + 'x' + '}'.repeat(50),
	},
} satisfies StoryObj<typeof MkFormulaCore>;
