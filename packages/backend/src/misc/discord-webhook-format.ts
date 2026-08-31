/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: Webhookの送信先がDiscordのWebhook URLだった場合、Misskeyの生JSONペイロード
// (人間には読めない)ではなくDiscordのEmbed形式に自動整形して送るための純粋関数群。
// 外部プロキシ(Cloudflare Worker等)を用意しなくても完結させる目的で追加した。
//
// 文言の言語は呼び出し側からJuiceSettings.defaultEmailLang(EmailI18nServiceと同じ設定)
// を渡してもらう想定。ja-JP以外は英語にフォールバックする(EmailI18nServiceのgetI18n()と
// 同じ2言語フォールバック方式。packages/i18nのParameterizedStringは使わず、このファイル
// 内で完結する簡易的な辞書にしている)。

import type { Packed } from '@/misc/json-schema.js';
import type { WebhookEventTypes } from '@/models/Webhook.js';
import type { SystemWebhookEventType } from '@/models/SystemWebhook.js';
import type {
	AbuseReportPayload,
	InactiveModeratorsWarningPayload,
	EmojiRequestCreatedPayload,
	SignupApplicationCreatedPayload,
} from '@/core/SystemWebhookService.js';
import type { UserWebhookPayload } from '@/core/UserWebhookService.js';

type UserLiteLike = Pick<Packed<'UserLite'>, 'id' | 'name' | 'username' | 'host' | 'avatarUrl'>;

type DiscordEmbed = {
	title?: string;
	description?: string;
	color?: number;
	fields?: { name: string, value: string, inline?: boolean }[];
	footer?: { text: string };
	timestamp?: string;
	thumbnail?: { url: string };
};

export type DiscordWebhookBody = {
	username: string;
	embeds: DiscordEmbed[];
};

const COLORS = {
	RED: 0xff0000,
	GREEN: 0x00ff00,
	BLUE: 0x3498db,
	ORANGE: 0xff9800,
	YELLOW: 0xffeb3b,
	PURPLE: 0x9c27b0,
	CYAN: 0x00bcd4,
} as const;

const NOTE_TEXT_LIMIT = 300;

type Messages = {
	abuseReportTitle: string;
	abuseReportResolvedTitle: string;
	reporterField: string;
	targetUserField: string;
	reportIdField: string;
	assigneeField: string;
	noComment: string;
	userCreatedTitle: string;
	userIdField: string;
	inactiveModeratorsWarningTitle: string;
	inactiveModeratorsWarningDescription: string;
	remainingTimeField: string;
	hoursSuffix: string;
	invitationOnlyChangedTitle: string;
	invitationOnlyChangedDescription: string;
	emojiRequestCreatedTitle: string;
	requesterField: string;
	categoryField: string;
	noCategory: string;
	signupApplicationCreatedTitle: string;
	noReason: string;
	applicantField: string;
	unknownEventTitle: string;
	unknownEventTypeLabel: string;
	newNoteTitle: string;
	replyTitle: string;
	renoteTitle: string;
	mentionTitle: string;
	followTitle: string;
	unfollowTitle: string;
	followedTitle: string;
	authorField: string;
	cwLabel: string;
	noNoteText: string;
};

const MESSAGES_JA: Messages = {
	abuseReportTitle: '🚨 新しい通報',
	abuseReportResolvedTitle: '✅ 通報が解決されました',
	reporterField: '通報者',
	targetUserField: '対象ユーザー',
	reportIdField: '通報ID',
	assigneeField: '担当者',
	noComment: '*コメントなし*',
	userCreatedTitle: '👤 新規ユーザー登録',
	userIdField: 'ユーザーID',
	inactiveModeratorsWarningTitle: '⚠️ モデレーター非アクティブ警告',
	inactiveModeratorsWarningDescription: 'モデレーターが長期間非アクティブです。このままの状態が続くと、サーバーが招待制に変更されます。',
	remainingTimeField: '残り時間',
	hoursSuffix: '時間',
	invitationOnlyChangedTitle: '🔒 サーバーが招待制に変更されました',
	invitationOnlyChangedDescription: 'モデレーターの長期非アクティブにより、サーバーが自動的に招待制に変更されました。',
	emojiRequestCreatedTitle: '🙂 絵文字申請が届きました',
	requesterField: '申請者',
	categoryField: 'カテゴリ',
	noCategory: '*未設定*',
	signupApplicationCreatedTitle: '📝 承認式登録の申請が届きました',
	noReason: '*理由なし*',
	applicantField: '申請者',
	unknownEventTitle: '📋 Webhook イベント',
	unknownEventTypeLabel: 'イベントタイプ',
	newNoteTitle: '📝 新しいノート',
	replyTitle: '💬 返信がありました',
	renoteTitle: '🔁 リノートされました',
	mentionTitle: '📣 メンションされました',
	followTitle: '➕ フォローしました',
	unfollowTitle: '➖ フォロー解除しました',
	followedTitle: '👋 フォローされました',
	authorField: '投稿者',
	cwLabel: 'CW',
	noNoteText: '*(本文なし)*',
};

const MESSAGES_EN: Messages = {
	abuseReportTitle: '🚨 New report',
	abuseReportResolvedTitle: '✅ Report resolved',
	reporterField: 'Reporter',
	targetUserField: 'Target user',
	reportIdField: 'Report ID',
	assigneeField: 'Assignee',
	noComment: '*No comment*',
	userCreatedTitle: '👤 New user registered',
	userIdField: 'User ID',
	inactiveModeratorsWarningTitle: '⚠️ Moderator inactivity warning',
	inactiveModeratorsWarningDescription: 'No moderator has been active for a while. If this continues, this server will switch to invite-only mode.',
	remainingTimeField: 'Remaining time',
	hoursSuffix: 'hour(s)',
	invitationOnlyChangedTitle: '🔒 Server switched to invite-only mode',
	invitationOnlyChangedDescription: 'Due to prolonged moderator inactivity, this server has automatically switched to invite-only mode.',
	emojiRequestCreatedTitle: '🙂 New emoji request',
	requesterField: 'Requester',
	categoryField: 'Category',
	noCategory: '*Unset*',
	signupApplicationCreatedTitle: '📝 New signup application',
	noReason: '*No reason given*',
	applicantField: 'Applicant',
	unknownEventTitle: '📋 Webhook event',
	unknownEventTypeLabel: 'Event type',
	newNoteTitle: '📝 New note',
	replyTitle: '💬 New reply',
	renoteTitle: '🔁 Renoted',
	mentionTitle: '📣 Mentioned',
	followTitle: '➕ Followed',
	unfollowTitle: '➖ Unfollowed',
	followedTitle: '👋 New follower',
	authorField: 'Author',
	cwLabel: 'CW',
	noNoteText: '*(no text)*',
};

// EmailI18nService.getI18n()と同じ2言語フォールバック(ja-JP以外はすべて英語)
function getMessages(lang: string): Messages {
	return lang === 'ja-JP' ? MESSAGES_JA : MESSAGES_EN;
}

// discord.com / discordapp.com のWebhook URLかどうかを判定する
export function isDiscordWebhookUrl(url: string): boolean {
	try {
		const { hostname, pathname } = new URL(url);
		return (hostname === 'discord.com' || hostname === 'discordapp.com') && pathname.startsWith('/api/webhooks/');
	} catch {
		return false;
	}
}

function formatUserHandle(user: UserLiteLike): string {
	const displayName = user.name || user.username;
	const handle = user.host ? `@${user.username}@${user.host}` : `@${user.username}`;
	return `${displayName} (${handle})`;
}

function getUserProfileUrl(server: string, user: UserLiteLike): string {
	return user.host ? `${server}/@${user.username}@${user.host}` : `${server}/@${user.username}`;
}

function formatUserLink(server: string, user: UserLiteLike): string {
	return `[${formatUserHandle(user)}](${getUserProfileUrl(server, user)})`;
}

function truncate(text: string, limit: number): string {
	return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

// ==== System Webhook (管理者向け) ====

function formatAbuseReport(server: string, payload: AbuseReportPayload, resolved: boolean, t: Messages): DiscordEmbed {
	const fields: NonNullable<DiscordEmbed['fields']> = [];
	if (payload.reporter) fields.push({ name: t.reporterField, value: formatUserLink(server, payload.reporter), inline: true });
	if (payload.targetUser) fields.push({ name: t.targetUserField, value: formatUserLink(server, payload.targetUser), inline: true });
	fields.push({ name: t.reportIdField, value: `\`${payload.id}\``, inline: true });
	if (resolved && payload.assignee) fields.push({ name: t.assigneeField, value: formatUserLink(server, payload.assignee), inline: true });

	return {
		title: resolved ? t.abuseReportResolvedTitle : t.abuseReportTitle,
		description: payload.comment || t.noComment,
		color: resolved ? COLORS.GREEN : COLORS.RED,
		fields,
		footer: { text: server },
	};
}

function formatUserCreated(server: string, user: UserLiteLike, t: Messages): DiscordEmbed {
	return {
		title: t.userCreatedTitle,
		description: formatUserLink(server, user),
		color: COLORS.BLUE,
		thumbnail: user.avatarUrl ? { url: user.avatarUrl } : undefined,
		fields: [{ name: t.userIdField, value: `\`${user.id}\``, inline: true }],
		footer: { text: server },
	};
}

function formatInactiveModeratorsWarning(server: string, payload: InactiveModeratorsWarningPayload, t: Messages): DiscordEmbed {
	return {
		title: t.inactiveModeratorsWarningTitle,
		description: t.inactiveModeratorsWarningDescription,
		color: COLORS.ORANGE,
		fields: [{ name: t.remainingTimeField, value: `${Math.round(payload.remainingTime.asHours)} ${t.hoursSuffix}`, inline: true }],
		footer: { text: server },
	};
}

function formatInactiveModeratorsInvitationOnlyChanged(server: string, t: Messages): DiscordEmbed {
	return {
		title: t.invitationOnlyChangedTitle,
		description: t.invitationOnlyChangedDescription,
		color: COLORS.YELLOW,
		footer: { text: server },
	};
}

// JUICE
function formatEmojiRequestCreated(server: string, payload: EmojiRequestCreatedPayload, t: Messages): DiscordEmbed {
	return {
		title: t.emojiRequestCreatedTitle,
		description: `\`:${payload.name}:\``,
		color: COLORS.PURPLE,
		fields: [
			{ name: t.requesterField, value: formatUserLink(server, payload.requester), inline: true },
			{ name: t.categoryField, value: payload.category ?? t.noCategory, inline: true },
		],
		footer: { text: server },
	};
}

// JUICE
function formatSignupApplicationCreated(server: string, payload: SignupApplicationCreatedPayload, t: Messages): DiscordEmbed {
	return {
		title: t.signupApplicationCreatedTitle,
		description: payload.reason || t.noReason,
		color: COLORS.CYAN,
		fields: [{ name: t.applicantField, value: formatUserLink(server, payload.applicant), inline: true }],
		footer: { text: server },
	};
}

function formatUnknownEvent(server: string, type: string, t: Messages): DiscordEmbed {
	return {
		title: t.unknownEventTitle,
		description: `${t.unknownEventTypeLabel}: \`${type}\``,
		color: COLORS.PURPLE,
		footer: { text: server },
	};
}

export function formatSystemWebhookForDiscord(type: SystemWebhookEventType, content: unknown, server: string, lang = 'ja-JP'): DiscordWebhookBody {
	const t = getMessages(lang);
	let embed: DiscordEmbed;

	switch (type) {
		case 'abuseReport':
			embed = formatAbuseReport(server, content as AbuseReportPayload, false, t);
			break;
		case 'abuseReportResolved':
			embed = formatAbuseReport(server, content as AbuseReportPayload, true, t);
			break;
		case 'userCreated':
			embed = formatUserCreated(server, content as UserLiteLike, t);
			break;
		case 'inactiveModeratorsWarning':
			embed = formatInactiveModeratorsWarning(server, content as InactiveModeratorsWarningPayload, t);
			break;
		case 'inactiveModeratorsInvitationOnlyChanged':
			embed = formatInactiveModeratorsInvitationOnlyChanged(server, t);
			break;
		case 'emojiRequestCreated':
			embed = formatEmojiRequestCreated(server, content as EmojiRequestCreatedPayload, t);
			break;
		case 'signupApplicationCreated':
			embed = formatSignupApplicationCreated(server, content as SignupApplicationCreatedPayload, t);
			break;
		default: {
			const _: never = type;
			embed = formatUnknownEvent(server, type as string, t);
		}
	}

	return { username: 'Misskey', embeds: [embed] };
}

// ==== User Webhook (ノート/フォロー通知) ====

function formatNoteEmbed(server: string, note: Packed<'Note'>, title: string, color: number, t: Messages): DiscordEmbed {
	const noteUrl = note.url ?? note.uri ?? `${server}/notes/${note.id}`;
	const description = note.cw
		? `**${t.cwLabel}:** ${note.cw}\n||${truncate(note.text ?? '', NOTE_TEXT_LIMIT)}||`
		: truncate(note.text ?? t.noNoteText, NOTE_TEXT_LIMIT);

	return {
		title: `[${title}](${noteUrl})`,
		description,
		color,
		fields: [{ name: t.authorField, value: formatUserLink(server, note.user), inline: true }],
		thumbnail: note.user.avatarUrl ? { url: note.user.avatarUrl } : undefined,
		footer: { text: server },
		timestamp: note.createdAt,
	};
}

function formatUserEmbed(server: string, user: UserLiteLike, title: string, color: number): DiscordEmbed {
	return {
		title,
		description: formatUserLink(server, user),
		color,
		thumbnail: user.avatarUrl ? { url: user.avatarUrl } : undefined,
		footer: { text: server },
	};
}

export function formatUserWebhookForDiscord(type: WebhookEventTypes, content: unknown, server: string, lang = 'ja-JP'): DiscordWebhookBody {
	const t = getMessages(lang);
	let embed: DiscordEmbed;

	switch (type) {
		case 'note':
			embed = formatNoteEmbed(server, (content as UserWebhookPayload<'note'>).note, t.newNoteTitle, COLORS.BLUE, t);
			break;
		case 'reply':
			embed = formatNoteEmbed(server, (content as UserWebhookPayload<'reply'>).note, t.replyTitle, COLORS.GREEN, t);
			break;
		case 'renote':
			embed = formatNoteEmbed(server, (content as UserWebhookPayload<'renote'>).note, t.renoteTitle, COLORS.CYAN, t);
			break;
		case 'mention':
			embed = formatNoteEmbed(server, (content as UserWebhookPayload<'mention'>).note, t.mentionTitle, COLORS.ORANGE, t);
			break;
		case 'follow':
			embed = formatUserEmbed(server, (content as UserWebhookPayload<'follow'>).user, t.followTitle, COLORS.BLUE);
			break;
		case 'unfollow':
			embed = formatUserEmbed(server, (content as UserWebhookPayload<'unfollow'>).user, t.unfollowTitle, COLORS.PURPLE);
			break;
		case 'followed':
			embed = formatUserEmbed(server, (content as UserWebhookPayload<'followed'>).user, t.followedTitle, COLORS.GREEN);
			break;
		default:
			// 'reaction' 等、現状ペイロードが定義されていないイベント種別のフォールバック
			embed = formatUnknownEvent(server, type as string, t);
	}

	return { username: 'Misskey', embeds: [embed] };
}
