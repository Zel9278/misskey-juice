/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { DrawRoomService } from '@/core/DrawRoomService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

/**
 * JUICE: 絵チャの部屋の掃除(放置された部屋の自動終了、終了した「保存しない」部屋の削除)
 */
@Injectable()
export class CleanDrawRoomsProcessorService {
	private logger: Logger;

	constructor(
		private drawRoomService: DrawRoomService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean-draw-rooms');
	}

	@bindThis
	public async process(): Promise<void> {
		await this.drawRoomService.cleanup();
	}
}
