/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { MiJuiceSettings } from '@/models/JuiceSettings.js';
import type { JuiceSettingsValue } from '@/models/JuiceSettings.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import type { OnApplicationShutdown } from '@nestjs/common';

const SINGLETON_ID = 'x';

@Injectable()
export class JuiceSettingsService implements OnApplicationShutdown {
	private cache: JuiceSettingsValue | undefined;
	private intervalId: NodeJS.Timeout;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.db)
		private db: DataSource,

		private globalEventService: GlobalEventService,
	) {
		if (process.env.NODE_ENV !== 'test') {
			this.intervalId = setInterval(() => {
				this.fetch(true).then(settings => {
					this.cache = settings;
				});
			}, 1000 * 60 * 5);
		}

		this.redisForSub.on('message', this.onMessage);
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			if (type === 'juiceSettingsUpdated') {
				this.cache = body.after;
			}
		}
	}

	@bindThis
	public async fetch(noCache = false): Promise<JuiceSettingsValue> {
		if (!noCache && this.cache) return this.cache;

		return await this.db.transaction(async em => {
			const row = await em.upsert(MiJuiceSettings, { id: SINGLETON_ID }, ['id'])
				.then(x => em.findOneByOrFail(MiJuiceSettings, x.identifiers[0]));
			this.cache = row.settings;
			return row.settings;
		});
	}

	@bindThis
	public async update(data: Partial<JuiceSettingsValue>): Promise<JuiceSettingsValue> {
		const before = await this.fetch(true);
		const after = { ...before, ...data };

		await this.db.transaction(async em => {
			await em.upsert(MiJuiceSettings, { id: SINGLETON_ID, settings: after }, ['id']);
		});

		this.cache = after;
		this.globalEventService.publishInternalEvent('juiceSettingsUpdated', { before, after });

		return after;
	}

	@bindThis
	public dispose(): void {
		clearInterval(this.intervalId);
		this.redisForSub.off('message', this.onMessage);
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.dispose();
	}
}
