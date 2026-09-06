/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { MiUser } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveRankingSettings } from '@/models/JuiceSettings.js';

const JUICE_RANKING_EPOCH = new Date('2026-01-01T00:00:00Z').getTime();

/**
 * JUICEユーザーランキング(投稿数・リアクション数)はインスタンス単位の集計を意図しているため、
 * ローカルユーザーの活動のみを対象とする。ホスト判定を漏らすと、ActivityPub経由で受信した
 * リモートユーザーの投稿・リアクションまで加点されてしまい、実質フェディバース全体のランキングに
 * なってしまう(実際に起きていた不具合)。
 */
export function isLocalForJuiceRanking(host: MiUser['host']): boolean {
	return host == null;
}

export type JuiceUserRankingEntry = {
	userId: MiUser['id'];
	score: number;
};

/**
 * JUICE 独自のユーザーランキング(投稿数・リアクション数)。
 * FeaturedService と同じ「エポック基準の期間別ZSET + 前期間とのブレンド + TTLによる自然消滅」方式を、
 * ノート/ギャラリー単位ではなくユーザー単位のスコアとして転用する。
 */
@Injectable()
export class JuiceUserRankingService {
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private juiceSettingsService: JuiceSettingsService,
	) {
	}

	@bindThis
	private async getWindowRangeMs(): Promise<number> {
		const settings = await this.juiceSettingsService.fetch();
		const { rankingAggregationPeriodHours } = resolveRankingSettings(settings);
		return rankingAggregationPeriodHours * 60 * 60 * 1000;
	}

	@bindThis
	private getCurrentWindow(windowRange: number): number {
		const passed = Date.now() - JUICE_RANKING_EPOCH;
		return Math.floor(passed / windowRange);
	}

	@bindThis
	private async incrementRanking(name: string, userId: MiUser['id']): Promise<void> {
		const windowRange = await this.getWindowRangeMs();
		const currentWindow = this.getCurrentWindow(windowRange);
		const redisTransaction = this.redisClient.multi();
		redisTransaction.zincrby(
			`${name}:${currentWindow}`,
			1,
			userId);
		redisTransaction.expire(
			`${name}:${currentWindow}`,
			(windowRange * 3) / 1000,
			'NX'); // "NX -- Set expiry only when the key has no expiry" = 有効期限がないときだけ設定
		await redisTransaction.exec();
	}

	@bindThis
	private async getRanking(name: string, limit: number): Promise<JuiceUserRankingEntry[]> {
		const windowRange = await this.getWindowRangeMs();
		const currentWindow = this.getCurrentWindow(windowRange);
		const previousWindow = currentWindow - 1;

		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.zrange(`${name}:${currentWindow}`, 0, -1, 'REV', 'WITHSCORES');
		redisPipeline.zrange(`${name}:${previousWindow}`, 0, -1, 'REV', 'WITHSCORES');
		const [currentResult, previousResult] = await redisPipeline.exec().then(result => result ? result.map(r => (r[1] ?? []) as string[]) : [[], []]);

		const ranking = new Map<string, number>();
		for (let i = 0; i < currentResult.length; i += 2) {
			ranking.set(currentResult[i], parseInt(currentResult[i + 1], 10));
		}
		for (let i = 0; i < previousResult.length; i += 2) {
			const userId = previousResult[i];
			const score = parseInt(previousResult[i + 1], 10);
			const exist = ranking.get(userId);
			ranking.set(userId, exist != null ? (exist + score) / 2 : score);
		}

		return Array.from(ranking.entries())
			.map(([userId, score]) => ({ userId, score: Math.round(score) }))
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);
	}

	/**
	 * Redisへの加点はランキング表示専用の非致命的な処理のため、失敗しても投稿・リアクション自体には影響させない。
	 */
	@bindThis
	public incrementPostCount(userId: MiUser['id']): void {
		this.incrementRanking('juiceUserRanking:posts', userId).catch(err => {
			console.error('Failed to increment JUICE user ranking (posts)', err);
		});
	}

	@bindThis
	public incrementReactionCount(userId: MiUser['id']): void {
		this.incrementRanking('juiceUserRanking:reactions', userId).catch(err => {
			console.error('Failed to increment JUICE user ranking (reactions)', err);
		});
	}

	@bindThis
	public getPostRanking(limit = 3): Promise<JuiceUserRankingEntry[]> {
		return this.getRanking('juiceUserRanking:posts', limit);
	}

	@bindThis
	public getReactionRanking(limit = 3): Promise<JuiceUserRankingEntry[]> {
		return this.getRanking('juiceUserRanking:reactions', limit);
	}

	@bindThis
	public async getPeriodHours(): Promise<number> {
		const settings = await this.juiceSettingsService.fetch();
		return resolveRankingSettings(settings).rankingAggregationPeriodHours;
	}
}
