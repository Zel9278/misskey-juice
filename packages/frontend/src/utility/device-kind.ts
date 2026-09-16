/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type DeviceKind = 'smartphone' | 'tablet' | 'desktop';

const ua = navigator.userAgent.toLowerCase();
const isTablet = /ipad/.test(ua) || (/mobile|iphone|android/.test(ua) && window.innerWidth > 700);
const isSmartphone = !isTablet && /mobile|iphone|android/.test(ua);

export const DEFAULT_DEVICE_KIND: DeviceKind = (
	isSmartphone
		? 'smartphone'
		: isTablet
			? 'tablet'
			: 'desktop'
);

export let deviceKind: DeviceKind = DEFAULT_DEVICE_KIND;

export function updateDeviceKind(kind: DeviceKind | null) {
	deviceKind = kind ?? DEFAULT_DEVICE_KIND;
}

// JUICE: iPadOS 13以降のSafariはデスクトップ版と同じUAを名乗る(iPadを名乗らない)ため、
// タッチ対応の"MacIntel"であることも合わせて判定する
export const isIosFamily = /iphone|ipod|ipad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
