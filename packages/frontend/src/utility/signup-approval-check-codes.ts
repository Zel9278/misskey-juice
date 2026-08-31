/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { miLocalStorage } from '@/local-storage.js';

// 1端末から複数アカウント分の承認式新規登録を申請することもあるため、
// 単一の値ではなく配列で保持する(JUICE)。
const STORAGE_KEY = 'signupApprovalCheckCodes';
const MAX_CODES = 20;

export function getSignupApprovalCheckCodes(): string[] {
	const codes = miLocalStorage.getItemAsJson(STORAGE_KEY);
	return Array.isArray(codes) ? codes.filter(x => typeof x === 'string') : [];
}

export function addSignupApprovalCheckCode(code: string): void {
	const codes = getSignupApprovalCheckCodes().filter(x => x !== code);
	codes.unshift(code);
	miLocalStorage.setItemAsJson(STORAGE_KEY, codes.slice(0, MAX_CODES));
}

export function removeSignupApprovalCheckCode(code: string): void {
	const codes = getSignupApprovalCheckCodes().filter(x => x !== code);
	miLocalStorage.setItemAsJson(STORAGE_KEY, codes);
}
