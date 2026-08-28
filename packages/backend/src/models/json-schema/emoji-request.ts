/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedEmojiRequestEntrySchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
		},
		createdAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
		fileId: {
			type: 'string',
			optional: false, nullable: true,
			format: 'id',
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		category: {
			type: 'string',
			optional: false, nullable: true,
		},
		license: {
			type: 'string',
			optional: false, nullable: true,
		},
		aliases: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'string',
				optional: false, nullable: false,
			},
		},
		isSensitive: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		localOnly: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		status: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['pending', 'approved', 'rejected'],
		},
		rejectReason: {
			type: 'string',
			optional: false, nullable: true,
		},
		reviewedAt: {
			type: 'string',
			optional: false, nullable: true,
			format: 'date-time',
		},
		resultEmojiId: {
			type: 'string',
			optional: false, nullable: true,
			format: 'id',
		},
	},
} as const;

// 管理画面の一覧では申請者の情報も併せて表示する必要があるため、Simple版とは別に用意する(JUICE)。
export const packedEmojiRequestEntryDetailedAdminSchema = {
	type: 'object',
	allOf: [
		{
			type: 'object',
			ref: 'EmojiRequestEntry',
		},
		{
			type: 'object',
			properties: {
				user: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'UserLite',
				},
				fileUrl: {
					type: 'string',
					optional: false, nullable: true,
				},
			},
		},
	],
} as const;
