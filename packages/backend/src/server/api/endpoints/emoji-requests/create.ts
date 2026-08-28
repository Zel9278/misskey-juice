/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { DriveFilesRepository, EmojiRequestsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveEmojiRequestSettings } from '@/models/JuiceSettings.js';
import { FILE_TYPE_IMAGE } from '@/const.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['emoji-requests'],

	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:emoji-requests',

	limit: {
		duration: ms('1day'),
		max: 10,
	},

	errors: {
		functionDisabled: {
			message: 'The emoji request feature is currently disabled.',
			code: 'FUNCTION_DISABLED',
			id: '1926c8ae-9ed6-4074-9c46-5f970c83a802',
		},
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'd3d24264-cf2e-49f0-a772-a124acfd76a9',
		},
		accessDenied: {
			message: 'You do not have permission to use this file.',
			code: 'ACCESS_DENIED',
			id: '813aa403-aed9-4ae3-a501-51110fcfce76',
		},
		unsupportedFileType: {
			message: 'Unsupported file type.',
			code: 'UNSUPPORTED_FILE_TYPE',
			id: 'b26a3c34-dd82-4562-956d-6492f2ac9c85',
		},
		tooManyPendingRequests: {
			message: 'You have too many pending emoji requests.',
			code: 'TOO_MANY_PENDING_REQUESTS',
			id: '12d24713-d080-458f-b80f-0c1905d96fb9',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'EmojiRequestEntry',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		fileId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', pattern: '^[a-zA-Z0-9_]+$' },
		category: { type: 'string', nullable: true },
		aliases: { type: 'array', items: { type: 'string' }, default: [] },
		license: { type: 'string', nullable: true },
		isSensitive: { type: 'boolean', default: false },
		localOnly: { type: 'boolean', default: false },
		deleteFileAfterReview: { type: 'boolean', default: false },
	},
	required: ['fileId', 'name'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.emojiRequestsRepository)
		private emojiRequestsRepository: EmojiRequestsRepository,

		private idService: IdService,
		private roleService: RoleService,
		private juiceSettingsService: JuiceSettingsService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const { emojiRequestEnabled } = resolveEmojiRequestSettings(await this.juiceSettingsService.fetch());
			if (!emojiRequestEnabled) throw new ApiError(meta.errors.functionDisabled);

			const driveFile = await this.driveFilesRepository.findOneBy({ id: ps.fileId });
			if (driveFile == null) throw new ApiError(meta.errors.noSuchFile);
			if (driveFile.userId !== me.id) throw new ApiError(meta.errors.accessDenied);
			if (!FILE_TYPE_IMAGE.includes(driveFile.type)) throw new ApiError(meta.errors.unsupportedFileType);

			const policies = await this.roleService.getUserPolicies(me.id);
			const pendingCount = await this.emojiRequestsRepository.countBy({ userId: me.id, status: 'pending' });
			if (pendingCount >= policies.emojiRequestLimit) throw new ApiError(meta.errors.tooManyPendingRequests);

			const request = await this.emojiRequestsRepository.insertOne({
				id: this.idService.gen(),
				userId: me.id,
				fileId: driveFile.id,
				name: ps.name,
				category: ps.category ?? null,
				aliases: ps.aliases ?? [],
				license: ps.license ?? null,
				isSensitive: ps.isSensitive ?? false,
				localOnly: ps.localOnly ?? false,
				status: 'pending',
				deleteFileAfterReview: ps.deleteFileAfterReview ?? false,
			});

			return {
				id: request.id,
				createdAt: this.idService.parse(request.id).date.toISOString(),
				fileId: request.fileId,
				name: request.name,
				category: request.category,
				aliases: request.aliases,
				license: request.license,
				isSensitive: request.isSensitive,
				localOnly: request.localOnly,
				status: request.status,
				rejectReason: request.rejectReason,
				reviewedAt: request.reviewedAt?.toISOString() ?? null,
				resultEmojiId: request.resultEmojiId,
			};
		});
	}
}
