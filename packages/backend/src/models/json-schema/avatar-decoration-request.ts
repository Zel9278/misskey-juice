/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedAvatarDecorationRequestEntrySchema = {
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
		// JUICE: 申請一覧でサムネイル表示に使う。承認/却下後にファイルが削除されていればnull
		fileUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		description: {
			type: 'string',
			optional: false, nullable: false,
		},
		category: {
			type: 'string',
			optional: false, nullable: true,
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
		resultAvatarDecorationId: {
			type: 'string',
			optional: false, nullable: true,
			format: 'id',
		},
	},
} as const;

// 管理画面の一覧では申請者の情報も併せて表示する必要があるため、Simple版とは別に用意する(JUICE)。
export const packedAvatarDecorationRequestEntryDetailedAdminSchema = {
	type: 'object',
	allOf: [
		{
			type: 'object',
			ref: 'AvatarDecorationRequestEntry',
		},
		{
			type: 'object',
			properties: {
				user: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'UserLite',
				},
			},
		},
	],
} as const;
