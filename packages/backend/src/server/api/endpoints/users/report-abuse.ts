/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { RoleService } from '@/core/RoleService.js';
import { AbuseReportService } from '@/core/AbuseReportService.js';
import { DI } from '@/di-symbols.js';
import type { ChatMessagesRepository, ChatRoomMembershipsRepository, NotesRepository } from '@/models/_.js';
import type { AbuseReportTargetType } from '@/models/AbuseUserReport.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['users'],

	requireCredential: true,
	kind: 'write:report-abuse',

	description: 'File a report.',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '1acefcb5-0959-43fd-9685-b48305736cb5',
		},

		cannotReportYourself: {
			message: 'Cannot report yourself.',
			code: 'CANNOT_REPORT_YOURSELF',
			id: '1e13149e-b1e8-43cf-902e-c01dbfcb202f',
		},

		cannotReportAdmin: {
			message: 'Cannot report the admin.',
			code: 'CANNOT_REPORT_THE_ADMIN',
			id: '35e166f5-05fb-4f87-a2d5-adb42676d48f',
		},

		// JUICE: 通報カテゴリ・対象コンテンツ(ノート/チャットメッセージ)関連のエラー
		invalidCategory: {
			message: 'Invalid report category.',
			code: 'INVALID_CATEGORY',
			id: '4535ce83-520f-4dac-bbe8-2b548b77b955',
		},

		cannotSpecifyBothNoteAndMessage: {
			message: 'Cannot specify both noteId and messageId.',
			code: 'CANNOT_SPECIFY_BOTH_NOTE_AND_MESSAGE',
			id: '70d3d7c5-ca53-41fd-bbc2-987e00b33b87',
		},

		invalidTargetNote: {
			message: 'The note does not exist or does not belong to the target user.',
			code: 'INVALID_TARGET_NOTE',
			id: '8a214d9b-fc4e-443d-a1a2-26c6e052334c',
		},

		invalidTargetChatMessage: {
			message: 'The chat message does not exist, does not belong to the target user, or you are not a party to it.',
			code: 'INVALID_TARGET_CHAT_MESSAGE',
			id: '27b24002-ff8d-4090-8f26-dd0aa5ac6e7f',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		comment: { type: 'string', minLength: 1, maxLength: 2048 },
		// JUICE: 通報カテゴリ・対象コンテンツの構造化参照(いずれも省略可、従来通りユーザーのみの通報も可能)
		category: { type: 'string', maxLength: 64, nullable: true },
		noteId: { type: 'string', format: 'misskey:id', nullable: true },
		messageId: { type: 'string', format: 'misskey:id', nullable: true },
		// JUICE: 状況の詳細(任意、commentとは別の自由記述欄)
		situationDetail: { type: 'string', maxLength: 2048, nullable: true },
	},
	required: ['userId', 'comment'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		private getterService: GetterService,
		private roleService: RoleService,
		private abuseReportService: AbuseReportService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Lookup user
			const targetUser = await this.getterService.getUser(ps.userId).catch(err => {
				if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
				throw err;
			});

			if (targetUser.id === me.id) {
				throw new ApiError(meta.errors.cannotReportYourself);
			}

			if (await this.roleService.isAdministrator(targetUser)) {
				throw new ApiError(meta.errors.cannotReportAdmin);
			}

			// JUICE: 通報カテゴリの検証(admin設定のreportCategoriesに存在するkeyのみ許可)
			let category: string | null = null;
			if (ps.category != null) {
				if (!(await this.abuseReportService.validateReportCategory(ps.category))) {
					throw new ApiError(meta.errors.invalidCategory);
				}
				category = ps.category;
			}

			// JUICE: 通報対象コンテンツ(ノート/チャットメッセージ)の構造化参照。
			// 対象ユーザー本人が発信したコンテンツであること、チャットメッセージについては
			// 通報者自身がその会話の当事者(1:1の相手 or ルームメンバー)であることを検証する
			if (ps.noteId != null && ps.messageId != null) {
				throw new ApiError(meta.errors.cannotSpecifyBothNoteAndMessage);
			}

			let targetType: AbuseReportTargetType | null = null;
			let targetNoteId: string | null = null;
			let targetChatMessageId: string | null = null;

			if (ps.noteId != null) {
				const note = await this.notesRepository.findOneBy({ id: ps.noteId });
				if (note == null || note.userId !== targetUser.id) {
					throw new ApiError(meta.errors.invalidTargetNote);
				}
				targetType = 'note';
				targetNoteId = note.id;
			}

			if (ps.messageId != null) {
				const message = await this.chatMessagesRepository.findOneBy({ id: ps.messageId });
				if (message == null || message.fromUserId !== targetUser.id) {
					throw new ApiError(meta.errors.invalidTargetChatMessage);
				}

				if (message.toRoomId != null) {
					const membership = await this.chatRoomMembershipsRepository.findOneBy({ userId: me.id, roomId: message.toRoomId });
					if (membership == null) {
						throw new ApiError(meta.errors.invalidTargetChatMessage);
					}
				} else if (message.toUserId !== me.id) {
					throw new ApiError(meta.errors.invalidTargetChatMessage);
				}

				targetType = 'chatMessage';
				targetChatMessageId = message.id;
			}

			await this.abuseReportService.report([{
				targetUserId: targetUser.id,
				targetUserHost: targetUser.host,
				reporterId: me.id,
				reporterHost: null,
				comment: ps.comment,
				category,
				targetType,
				targetNoteId,
				targetChatMessageId,
				situationDetail: ps.situationDetail ?? null,
			}]);
		});
	}
}
