/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: misskey-tempuraのコンタクトフォームを参考に追加
import { computed, ref } from 'vue';
import { juicePublicSettingsCache } from '@/cache.js';
import { misskeyApi } from '@/utility/misskey-api.js';

export type ContactFormCategory = {
	key: string;
	text: string;
	enabled: boolean;
	order: number;
	isDefault: boolean;
};

export function useContactFormCategories() {
	const categories = ref<ContactFormCategory[]>([]);

	// includeDisabled: 管理画面向け。無効化されたカテゴリも含めてラベル解決・絞り込み選択肢を作れるようにする
	// (公開設定は無効カテゴリを含まないため、admin/contact-form/categoriesから取得し直す。
	// admin/juice/settingsはrequireAdminでモデレーターが弾かれるため使わない)
	const fetchCategories = async (opts: { includeDisabled?: boolean } = {}): Promise<ContactFormCategory[]> => {
		const source = opts.includeDisabled
			? await misskeyApi('admin/contact-form/categories')
			: (await juicePublicSettingsCache.fetch()).contactFormCategories;

		const resolvedCategories = (source ?? [])
			.filter(cat => opts.includeDisabled || cat.enabled)
			.sort((a, b) => a.order - b.order);
		categories.value = resolvedCategories;
		return resolvedCategories;
	};

	const getCategoryLabel = (key: string): string => {
		const category = categories.value.find(cat => cat.key === key);
		return category ? category.text : key;
	};

	const getDefaultCategory = (): string => {
		const defaultCategory = categories.value.find(cat => cat.isDefault);
		return defaultCategory ? defaultCategory.key : 'other';
	};

	const categoryOptions = computed(() => {
		return categories.value.map(cat => ({
			value: cat.key,
			label: cat.text,
		}));
	});

	return {
		categories,
		fetchCategories,
		getCategoryLabel,
		getDefaultCategory,
		categoryOptions,
	};
}
