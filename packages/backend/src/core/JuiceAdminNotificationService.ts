/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { RoleService } from '@/core/RoleService.js';
import { SystemWebhookService, type EmojiRequestCreatedPayload, type SignupApplicationCreatedPayload, type AvatarDecorationRequestCreatedPayload } from '@/core/SystemWebhookService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';

// JUICE: 絵文字申請・承認式登録申請が来たことをモデレータに通知する。
// AbuseReportNotificationService(通報の通知)と同じ「モデレータ一覧取得→admin streamへpublish→
// SystemWebhookへenqueue」というパターンを、通報ほど複雑な通知先カスタマイズ(メール等)を必要としない
// この2つのイベント向けに軽量にまとめたもの。
//
// 呼び出し元(emoji-requests/create.ts・SignupApiService.ts)では、このサービスを呼ぶ時点で
// 既にDBへの書き込み(絵文字申請の作成、あるいはアカウント作成・checkCode発行)が完了しており、
// 取り消せない副作用が確定している。通知処理の失敗がそこに巻き込まれて呼び出し元へエラーとして
// 伝播すると、実際には成功している処理がクライアントには失敗として見えてしまうため、
// 通知の失敗はここで握りつぶしログに残すだけにとどめ、呼び出し元には影響させない。
@Injectable()
export class JuiceAdminNotificationService {
	private logger: Logger;

	constructor(
		private roleService: RoleService,
		private globalEventService: GlobalEventService,
		private systemWebhookService: SystemWebhookService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('juice-admin-notification');
	}

	@bindThis
	public async notifyNewEmojiRequest(payload: EmojiRequestCreatedPayload): Promise<void> {
		try {
			const moderatorIds = await this.roleService.getModeratorIds({
				includeAdmins: true,
				excludeExpire: true,
			});

			for (const moderatorId of moderatorIds) {
				this.globalEventService.publishAdminStream(moderatorId, 'newEmojiRequest', payload);
			}

			await this.systemWebhookService.enqueueSystemWebhook('emojiRequestCreated', payload);
		} catch (err) {
			this.logger.error('Failed to notify new emoji request', { stack: err });
		}
	}

	@bindThis
	public async notifyNewSignupApplication(payload: SignupApplicationCreatedPayload): Promise<void> {
		try {
			const moderatorIds = await this.roleService.getModeratorIds({
				includeAdmins: true,
				excludeExpire: true,
			});

			for (const moderatorId of moderatorIds) {
				this.globalEventService.publishAdminStream(moderatorId, 'newSignupApplication', payload);
			}

			await this.systemWebhookService.enqueueSystemWebhook('signupApplicationCreated', payload);
		} catch (err) {
			this.logger.error('Failed to notify new signup application', { stack: err });
		}
	}

	@bindThis
	public async notifyNewAvatarDecorationRequest(payload: AvatarDecorationRequestCreatedPayload): Promise<void> {
		try {
			const moderatorIds = await this.roleService.getModeratorIds({
				includeAdmins: true,
				excludeExpire: true,
			});

			for (const moderatorId of moderatorIds) {
				this.globalEventService.publishAdminStream(moderatorId, 'newAvatarDecorationRequest', payload);
			}

			await this.systemWebhookService.enqueueSystemWebhook('avatarDecorationRequestCreated', payload);
		} catch (err) {
			this.logger.error('Failed to notify new avatar decoration request', { stack: err });
		}
	}
}
