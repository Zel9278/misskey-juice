/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: useContactFormCategories.tsを参考に追加
import { computed, ref } from 'vue';
import { juicePublicSettingsCache } from '@/cache.js';
import { misskeyApi } from '@/utility/misskey-api.js';

export type AbuseReportCategory = {
	key: string;
	text: string;
	enabled: boolean;
	order: number;
	isDefault: boolean;
};

export function useAbuseReportCategories() {
	const categories = ref<AbuseReportCategory[]>([]);

	// includeDisabled: 管理画面(モデレーター)向け。無効化されたカテゴリも含めてラベル解決できるようにする
	// (公開設定は無効カテゴリを含まないため、admin/abuse-report/categoriesから取得し直す。
	// admin/juice/settingsはrequireAdminでモデレーターが弾かれるため使わない)
	const fetchCategories = async (opts: { includeDisabled?: boolean } = {}): Promise<AbuseReportCategory[]> => {
		const source = opts.includeDisabled
			? await misskeyApi('admin/abuse-report/categories')
			: (await juicePublicSettingsCache.fetch()).reportCategories;

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
