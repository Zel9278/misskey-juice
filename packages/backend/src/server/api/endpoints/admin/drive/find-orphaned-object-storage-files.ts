/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { DriveFilesRepository, MiMeta } from '@/models/_.js';
import { S3Service } from '@/core/S3Service.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../../error.js';

// JUICE: オブジェクトストレージ上に残っているが、どのDriveFileからも参照されなくなった
// (DBの行だけ消えた等の理由で孤立した)オブジェクトを見つけ、必要なら削除する
// (misskey-tempuraの「孤立S3ファイルの自動クリーンアップ」を参考)。
//
// 安全のため既定はdryRun(一覧を返すだけで削除しない)。1回の呼び出しでバケット全体を
// 舐めるのは大規模インスタンスでは非現実的なため、limit件数ずつcontinuationTokenで
// ページングする設計にしている(自動実行のcronジョブとしては登録せず、管理者が手動で
// 状況を確認しながら呼び出すことを想定)。
//
// アップロード処理(DriveService.save())はオブジェクトストレージへの実アップロードが
// 完了してからDriveFile行をinsertするため、その間の一瞬だけ「S3にはあるがDBにはまだ無い」
// 状態が存在する。ちょうどその瞬間にスキャンすると今アップロード中のファイルを誤って
// 孤立扱いしてしまうため、UPLOAD_GRACE_PERIOD_MS以内に更新されたオブジェクトは
// 孤立候補から除外する。
const UPLOAD_GRACE_PERIOD_MS = 1000 * 60 * 60 * 6; // 6時間

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:drive',

	description: 'Find (and optionally delete) object storage objects that are no longer referenced by any drive file. Deletion is immediate and irreversible, so `dryRun` defaults to true.',

	errors: {
		objectStorageNotEnabled: {
			message: 'Object storage is not enabled on this instance.',
			code: 'OBJECT_STORAGE_NOT_ENABLED',
			id: '71e9c151-5c59-42dc-aa47-d3b0e10a1964',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			scanned: {
				type: 'number',
				optional: false, nullable: false,
			},
			orphanedKeys: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
					optional: false, nullable: false,
				},
			},
			deletedKeys: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
					optional: false, nullable: false,
				},
			},
			failedKeys: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
					optional: false, nullable: false,
				},
			},
			nextContinuationToken: {
				type: 'string',
				optional: false, nullable: true,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		dryRun: { type: 'boolean', default: true },
		limit: { type: 'integer', default: 1000, minimum: 1, maximum: 10000 },
		continuationToken: { type: 'string', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private s3Service: S3Service,
		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (!this.serverSettings.useObjectStorage) {
				throw new ApiError(meta.errors.objectStorageNotEnabled);
			}

			const prefix = this.serverSettings.objectStoragePrefix ? `${this.serverSettings.objectStoragePrefix}/` : undefined;
			const { objects, nextContinuationToken } = await this.s3Service.list(this.serverSettings, {
				prefix,
				continuationToken: ps.continuationToken ?? undefined,
				maxKeys: ps.limit,
			});

			// アップロード直後(DriveFile行がまだinsertされていない可能性がある)のオブジェクトは対象から除く
			const graceThreshold = Date.now() - UPLOAD_GRACE_PERIOD_MS;
			const candidates = objects.filter(o => o.lastModified == null || o.lastModified.getTime() < graceThreshold);

			if (candidates.length === 0) {
				return {
					scanned: objects.length,
					orphanedKeys: [],
					deletedKeys: [],
					failedKeys: [],
					nextContinuationToken: nextContinuationToken ?? null,
				};
			}

			const candidateKeys = candidates.map(o => o.key);

			// このページで見つかったキーのうち、DriveFileから実際に参照されているものを洗い出す
			const referencedRows = await this.driveFilesRepository.createQueryBuilder('file')
				.select('file.accessKey', 'accessKey')
				.addSelect('file.thumbnailAccessKey', 'thumbnailAccessKey')
				.addSelect('file.webpublicAccessKey', 'webpublicAccessKey')
				.where('file.accessKey IN (:...keys)', { keys: candidateKeys })
				.orWhere('file.thumbnailAccessKey IN (:...keys)', { keys: candidateKeys })
				.orWhere('file.webpublicAccessKey IN (:...keys)', { keys: candidateKeys })
				.getRawMany<{ accessKey: string | null; thumbnailAccessKey: string | null; webpublicAccessKey: string | null }>();

			const referencedKeys = new Set<string>();
			for (const row of referencedRows) {
				if (row.accessKey != null) referencedKeys.add(row.accessKey);
				if (row.thumbnailAccessKey != null) referencedKeys.add(row.thumbnailAccessKey);
				if (row.webpublicAccessKey != null) referencedKeys.add(row.webpublicAccessKey);
			}

			const orphanedKeys = candidateKeys.filter(key => !referencedKeys.has(key));

			const deletedKeys: string[] = [];
			const failedKeys: string[] = [];
			if (!ps.dryRun) {
				for (const key of orphanedKeys) {
					try {
						await this.s3Service.delete(this.serverSettings, {
							Bucket: this.serverSettings.objectStorageBucket ?? undefined,
							Key: key,
						});
						deletedKeys.push(key);
					} catch {
						// 1件の失敗でループ全体を止めず、失敗したキーを記録して次へ進む
						failedKeys.push(key);
					}
				}

				await this.moderationLogService.log(me, 'cleanupOrphanedObjectStorageFiles', {
					dryRun: false,
					scanned: objects.length,
					deletedCount: deletedKeys.length,
					deletedKeys,
					failedKeys,
				});
			}

			return {
				scanned: objects.length,
				orphanedKeys,
				deletedKeys,
				failedKeys,
				nextContinuationToken: nextContinuationToken ?? null,
			};
		});
	}
}
