/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import MkNovelViewerColorPicker from './MkNovelViewerColorPicker.vue';

export const Default = {
	render(args) {
		return {
			components: { MkNovelViewerColorPicker },
			setup() {
				return { args };
			},
			template: '<MkNovelViewerColorPicker v-bind="args"/>',
		};
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkNovelViewerColorPicker>;
