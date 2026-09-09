/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import { $i, iAmModerator } from '@/i.js';
import { useStream } from '@/stream.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

// JUICE: 通報・絵文字申請・承認式登録申請・アバターデコレーション申請・お問い合わせについて、
// 「未対応がある」ことを示すバナー用state。モデレーターだけでなく、対応する
// ロールポリシー(canApproveEmojiRequests等)を個別に付与されたユーザーも対象になるため、
// admin/index.vue専用ではなくアプリ全体の共有stateとしてここに集約する
export const thereIsUnresolvedAbuseReport = ref(false);
export const thereArePendingEmojiRequests = ref(false);
export const thereArePendingSignupApplications = ref(false);
export const thereArePendingAvatarDecorationRequests = ref(false);
export const thereArePendingContactForms = ref(false);

let initialized = false;

/**
 * JUICE: モデレーター、またはcanApproveEmojiRequests等のロールポリシーを個別に持つユーザーについて、
 * アプリ起動時に一度だけadminストリームを購読し、リアルタイムトースト表示とバナーstateの更新を行う。
 * 対象は/adminへ到達できないポリシーのみのユーザーも含むため、特定ページのライフサイクルに
 * 依存させず、常時マウントされているcommon.vueから呼び出す(main streamの'notification'購読と同じ方式)。
 * 権限を持たないユーザーでは何もしない
 */
export function initJuiceAdminNotifications(): void {
	if (initialized) return;
	if ($i == null) return;

	const canApproveEmojiRequests = iAmModerator || $i.policies.canApproveEmojiRequests;
	const canApproveSignups = iAmModerator || $i.policies.canApproveSignups;
	const canApproveAvatarDecorationRequests = iAmModerator || $i.policies.canApproveAvatarDecorationRequests;
	const canProcessContactForms = iAmModerator || $i.policies.canProcessContactForms;

	if (!iAmModerator && !canApproveEmojiRequests && !canApproveSignups && !canApproveAvatarDecorationRequests && !canProcessContactForms) return;

	initialized = true;

	if (iAmModerator) {
		misskeyApi('admin/abuse-user-reports', {
			state: 'unresolved',
			limit: 1,
		}).then(reports => {
			if (reports.length > 0) thereIsUnresolvedAbuseReport.value = true;
		});
	}

	if (canApproveEmojiRequests) {
		misskeyApi('admin/emoji-requests/list', {
			state: 'pending',
			limit: 1,
		}).then(requests => {
			if (requests.length > 0) thereArePendingEmojiRequests.value = true;
		});
	}

	if (canApproveSignups) {
		misskeyApi('admin/juice/pending-signups', {
			limit: 1,
		}).then(users => {
			if (users.length > 0) thereArePendingSignupApplications.value = true;
		});
	}

	if (canApproveAvatarDecorationRequests) {
		misskeyApi('admin/avatar-decoration-requests/list', {
			state: 'pending',
			limit: 1,
		}).then(requests => {
			if (requests.length > 0) thereArePendingAvatarDecorationRequests.value = true;
		});
	}

	if (canProcessContactForms) {
		misskeyApi('admin/contact-form/list', {
			status: 'pending',
			limit: 1,
		}).then(contactForms => {
			if (contactForms.length > 0) thereArePendingContactForms.value = true;
		});
	}

	const connection = useStream().useChannel('admin');

	// JUICE: 通報はまだ通常の通知(🔔)化していないため、ここでの即時トーストを引き続き使う
	connection.on('newAbuseUserReport', () => {
		os.toast(i18n.ts.newAbuseReportToast);
		thereIsUnresolvedAbuseReport.value = true;
	});

	// JUICE: 絵文字申請・アバターデコレーション申請・承認式登録申請・お問い合わせの新着は
	// notificationService.createNotification()経由で通常の通知(🔔)としても届くため、
	// トースト表示はcommon.vueの既存のnotification購読(onNotification)に任せ、ここでは
	// バナーstateの即時更新のみ行う(admin streamの方がnotificationsの反映より速いことがあるため、
	// バナー更新自体はここに残す)
	connection.on('newEmojiRequest', () => {
		thereArePendingEmojiRequests.value = true;
	});

	connection.on('newSignupApplication', () => {
		thereArePendingSignupApplications.value = true;
	});

	connection.on('newAvatarDecorationRequest', () => {
		thereArePendingAvatarDecorationRequests.value = true;
	});

	connection.on('newContactForm', () => {
		thereArePendingContactForms.value = true;
	});
}
