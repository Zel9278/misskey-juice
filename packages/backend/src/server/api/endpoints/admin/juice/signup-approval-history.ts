/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { SignupApprovalChecksRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

// JUICE: 承認式新規登録のうち、既に審査済み(承認/却下)の申請を履歴として一覧取得するためのエンドポイント。
// 審査待ち(pending)はadmin/juice/pending-signupsが実際のuser行を対象に扱っており(承認/却下操作に
// 実在するuserIdが必要なため)、こちらはsignup_approval_checkのスナップショットを参照する読み取り専用の
// 履歴用途に限定する。却下されたアカウントは物理削除されるため、username/signupReasonは申請時点の
// スナップショットを表示する。
export const signupApprovalHistoryStatuses = ['approved', 'declined'] as const;

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	// JUICE: モデレーター/管理者、またはcanApproveSignupsロールポリシーを持つユーザーのみ許可
	requiredRolePolicyOrModerator: 'canApproveSignups',
	// JUICE: reviewer(審査したモデレーター本人の身元)を含むレスポンスのため、
	// 審査待ち一覧のみのread:admin:juice-pending-signupsとは別のkindにする
	kind: 'read:admin:juice-signup-approval-history',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
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
				username: {
					type: 'string',
					optional: false, nullable: true,
				},
				signupReason: {
					type: 'string',
					optional: false, nullable: true,
				},
				status: {
					type: 'string',
					optional: false, nullable: false,
					enum: signupApprovalHistoryStatuses,
				},
				reason: {
					type: 'string',
					optional: false, nullable: true,
				},
				reviewedAt: {
					type: 'string',
					optional: false, nullable: true,
					format: 'date-time',
				},
				reviewer: {
					type: 'object',
					optional: false, nullable: true,
					ref: 'UserLite',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		state: { type: 'string', enum: signupApprovalHistoryStatuses, default: 'approved' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.signupApprovalChecksRepository)
		private signupApprovalChecksRepository: SignupApprovalChecksRepository,

		private queryService: QueryService,
		private idService: IdService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.queryService.makePaginationQuery(this.signupApprovalChecksRepository.createQueryBuilder('check'), ps.sinceId, ps.untilId)
				.andWhere('check.status = :status', { status: ps.state })
				.leftJoinAndSelect('check.reviewer', 'reviewer');

			const checks = await query.limit(ps.limit).getMany();

			return await Promise.all(checks.map(async check => ({
				id: check.id,
				createdAt: this.idService.parse(check.id).date.toISOString(),
				username: check.username,
				signupReason: check.signupReason,
				status: check.status as typeof signupApprovalHistoryStatuses[number],
				reason: check.reason,
				reviewedAt: check.reviewedAt?.toISOString() ?? null,
				reviewer: check.reviewer ? await this.userEntityService.pack(check.reviewer, me, { schema: 'UserLite' }) : null,
			})));
		});
	}
}
