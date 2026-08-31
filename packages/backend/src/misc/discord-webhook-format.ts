/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: Webhookの送信先がDiscordのWebhook URLだった場合、Misskeyの生JSONペイロード
// (人間には読めない)ではなくDiscordのEmbed形式に自動整形して送るための純粋関数群。
// 外部プロキシ(Cloudflare Worker等)を用意しなくても完結させる目的で追加した。

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

function formatAbuseReport(server: string, payload: AbuseReportPayload, resolved: boolean): DiscordEmbed {
	const fields: NonNullable<DiscordEmbed['fields']> = [];
	if (payload.reporter) fields.push({ name: '通報者', value: formatUserLink(server, payload.reporter), inline: true });
	if (payload.targetUser) fields.push({ name: '対象ユーザー', value: formatUserLink(server, payload.targetUser), inline: true });
	fields.push({ name: '通報ID', value: `\`${payload.id}\``, inline: true });
	if (resolved && payload.assignee) fields.push({ name: '担当者', value: formatUserLink(server, payload.assignee), inline: true });

	return {
		title: resolved ? '✅ 通報が解決されました' : '🚨 新しい通報',
		description: payload.comment || '*コメントなし*',
		color: resolved ? COLORS.GREEN : COLORS.RED,
		fields,
		footer: { text: server },
	};
}

function formatUserCreated(server: string, user: UserLiteLike): DiscordEmbed {
	return {
		title: '👤 新規ユーザー登録',
		description: formatUserLink(server, user),
		color: COLORS.BLUE,
		thumbnail: user.avatarUrl ? { url: user.avatarUrl } : undefined,
		fields: [{ name: 'ユーザーID', value: `\`${user.id}\``, inline: true }],
		footer: { text: server },
	};
}

function formatInactiveModeratorsWarning(server: string, payload: InactiveModeratorsWarningPayload): DiscordEmbed {
	return {
		title: '⚠️ モデレーター非アクティブ警告',
		description: 'モデレーターが長期間非アクティブです。このままの状態が続くと、サーバーが招待制に変更されます。',
		color: COLORS.ORANGE,
		fields: [{ name: '残り時間', value: `約 ${Math.round(payload.remainingTime.asHours)} 時間`, inline: true }],
		footer: { text: server },
	};
}

function formatInactiveModeratorsInvitationOnlyChanged(server: string): DiscordEmbed {
	return {
		title: '🔒 サーバーが招待制に変更されました',
		description: 'モデレーターの長期非アクティブにより、サーバーが自動的に招待制に変更されました。',
		color: COLORS.YELLOW,
		footer: { text: server },
	};
}

// JUICE
function formatEmojiRequestCreated(server: string, payload: EmojiRequestCreatedPayload): DiscordEmbed {
	return {
		title: '🙂 絵文字申請が届きました',
		description: `\`:${payload.name}:\``,
		color: COLORS.PURPLE,
		fields: [
			{ name: '申請者', value: formatUserLink(server, payload.requester), inline: true },
			{ name: 'カテゴリ', value: payload.category ?? '*未設定*', inline: true },
		],
		footer: { text: server },
	};
}

// JUICE
function formatSignupApplicationCreated(server: string, payload: SignupApplicationCreatedPayload): DiscordEmbed {
	return {
		title: '📝 承認式登録の申請が届きました',
		description: payload.reason || '*理由なし*',
		color: COLORS.CYAN,
		fields: [{ name: '申請者', value: formatUserLink(server, payload.applicant), inline: true }],
		footer: { text: server },
	};
}

export function formatSystemWebhookForDiscord(type: SystemWebhookEventType, content: unknown, server: string): DiscordWebhookBody {
	let embed: DiscordEmbed;

	switch (type) {
		case 'abuseReport':
			embed = formatAbuseReport(server, content as AbuseReportPayload, false);
			break;
		case 'abuseReportResolved':
			embed = formatAbuseReport(server, content as AbuseReportPayload, true);
			break;
		case 'userCreated':
			embed = formatUserCreated(server, content as UserLiteLike);
			break;
		case 'inactiveModeratorsWarning':
			embed = formatInactiveModeratorsWarning(server, content as InactiveModeratorsWarningPayload);
			break;
		case 'inactiveModeratorsInvitationOnlyChanged':
			embed = formatInactiveModeratorsInvitationOnlyChanged(server);
			break;
		case 'emojiRequestCreated':
			embed = formatEmojiRequestCreated(server, content as EmojiRequestCreatedPayload);
			break;
		case 'signupApplicationCreated':
			embed = formatSignupApplicationCreated(server, content as SignupApplicationCreatedPayload);
			break;
		default: {
			const _: never = type;
			embed = { title: '📋 Webhook イベント', description: `イベントタイプ: \`${type as string}\``, color: COLORS.PURPLE, footer: { text: server } };
		}
	}

	return { username: 'Misskey', embeds: [embed] };
}

// ==== User Webhook (ノート/フォロー通知) ====

function formatNoteEmbed(server: string, note: Packed<'Note'>, title: string, color: number): DiscordEmbed {
	const noteUrl = note.url ?? note.uri ?? `${server}/notes/${note.id}`;
	const description = note.cw
		? `**CW:** ${note.cw}\n||${truncate(note.text ?? '', NOTE_TEXT_LIMIT)}||`
		: truncate(note.text ?? '*(本文なし)*', NOTE_TEXT_LIMIT);

	return {
		title: `[${title}](${noteUrl})`,
		description,
		color,
		fields: [{ name: '投稿者', value: formatUserLink(server, note.user), inline: true }],
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

export function formatUserWebhookForDiscord(type: WebhookEventTypes, content: unknown, server: string): DiscordWebhookBody {
	let embed: DiscordEmbed;

	switch (type) {
		case 'note':
			embed = formatNoteEmbed(server, (content as UserWebhookPayload<'note'>).note, '📝 新しいノート', COLORS.BLUE);
			break;
		case 'reply':
			embed = formatNoteEmbed(server, (content as UserWebhookPayload<'reply'>).note, '💬 返信がありました', COLORS.GREEN);
			break;
		case 'renote':
			embed = formatNoteEmbed(server, (content as UserWebhookPayload<'renote'>).note, '🔁 リノートされました', COLORS.CYAN);
			break;
		case 'mention':
			embed = formatNoteEmbed(server, (content as UserWebhookPayload<'mention'>).note, '📣 メンションされました', COLORS.ORANGE);
			break;
		case 'follow':
			embed = formatUserEmbed(server, (content as UserWebhookPayload<'follow'>).user, '➕ フォローしました', COLORS.BLUE);
			break;
		case 'unfollow':
			embed = formatUserEmbed(server, (content as UserWebhookPayload<'unfollow'>).user, '➖ フォロー解除しました', COLORS.PURPLE);
			break;
		case 'followed':
			embed = formatUserEmbed(server, (content as UserWebhookPayload<'followed'>).user, '👋 フォローされました', COLORS.GREEN);
			break;
		default:
			// 'reaction' 等、現状ペイロードが定義されていないイベント種別のフォールバック
			embed = { title: '📋 Webhook イベント', description: `イベントタイプ: \`${type as string}\``, color: COLORS.PURPLE, footer: { text: server } };
	}

	return { username: 'Misskey', embeds: [embed] };
}
