/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import Limiter from 'ratelimiter';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import { bindThis } from '@/decorators.js';
import type { IEndpointMeta } from './endpoints.js';

type RateLimitInfo = {
	code: 'BRIEF_REQUEST_INTERVAL',
	info: Limiter.LimiterInfo,
} | {
	code: 'RATE_LIMIT_EXCEEDED',
	info: Limiter.LimiterInfo,
};

@Injectable()
export class RateLimiterService {
	private logger: Logger;
	private disabled = false;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('limiter');

		if (process.env.NODE_ENV !== 'production') {
			this.disabled = true;
		}
	}

	@bindThis
	private checkLimiter(options: Limiter.LimiterOption): Promise<Limiter.LimiterInfo> {
		return new Promise<Limiter.LimiterInfo>((resolve, reject) => {
			new Limiter(options).get((err, info) => {
				if (err) {
					return reject(err);
				}
				resolve(info);
			});
		});
	}

	/**
	 * JUICE: {@link limit}と同じRedis ZSET(ratelimiterパッケージの内部実装、キー形式
	 * `limit:${actor}:${limitation.key}`)を、消費(zadd)を伴わずに現在の使用状況だけ読み取る。
	 * UI側で「本日あと何回送信できるか」を表示するためのもので、ratelimiterパッケージの
	 * Limiter.get()自体は呼び出すたびに新しいタイムスタンプを追加してしまう(参照と消費が
	 * 不可分)ため使えず、同じZSETを直接読むことで消費を避けている。
	 * 期限切れエントリの除去(zremrangebyscore)は行うが、これはlimit()呼び出し時にも
	 * 必ず行われる操作であり、件数を変えない限り安全(ゾンビエントリの掃除にしかならない)
	 *
	 * JUICE: limit()と異なり、this.disabledがtrueでも早期returnしない。disabledは
	 * NODE_ENV!=='production'で常にtrueになり、実際のレート制限適用(limit())を丸ごと
	 * 無効化するためのものだが、peekUsage()はブロックを行わない参照専用の処理であり、
	 * dev環境で無効化する実害が無い一方、UI側の表示(このメソッドの主目的)がdev環境では
	 * 一切確認できなくなってしまう方が問題が大きい。dev環境ではlimit()側がZSETへの
	 * 書き込み(zadd)自体を行わないため、実際に消費が反映されるわけではない
	 * (常にused=0からの計算になる)点は留意
	 */
	@bindThis
	public async peekUsage(limitation: { key: NonNullable<string>, duration?: number | null, max?: number | null }, actor: string, factor = 1): Promise<{ used: number, max: number, resetAt: number | null } | null> {
		if (limitation.duration == null || limitation.max == null) {
			return null;
		}

		// JUICE: ApiCallService.call()の`factor > 0`ガード(factor<=0のロールはlimit()自体を
		// 呼ばずレート制限を完全にバイパスする)と挙動を一致させる。ここで弾かないと、
		// factor<=0のとき max<=0 になり「本日あと0回」と誤表示してしまう
		// (実際には無制限に送信できるにもかかわらず)
		if (factor <= 0) {
			return null;
		}

		const max = limitation.max / factor;
		const key = `limit:${actor}:${limitation.key}`;
		const now = Date.now() * 1000;
		const start = now - limitation.duration * 1000;

		// JUICE: 次にいつ枠が空くか(ETA)を、ratelimiterパッケージのLimiter.get()と同じ考え方で
		// 算出する。「使用中の枠のうちもっとも古いもの」がduration経過して失効すれば1枠空くため、
		// zrangeで「先頭(全体最古)」と「末尾からmax番目(現在のポリシー上限で見た場合の窓の境界)」の
		// 2件を読み、後者があればそれを、無ければ前者を基準にする(Limiter.get()のoldest/oldestInRange
		// と同じフォールバック)。zaddは行わないため、この2件は消費前の既存メンバーのみを見る
		const maxIndex = Math.max(0, Math.floor(max));

		const results = await this.redisClient.multi([
			['zremrangebyscore', key, 0, start],
			['zcard', key],
			['zrange', key, 0, 0],
			['zrange', key, -maxIndex, -maxIndex],
		]).exec();

		const cardResult = results?.[1];
		const used = cardResult && cardResult[0] == null ? Number(cardResult[1]) : 0;

		const oldestResult = results?.[2];
		const oldestMembers = oldestResult && oldestResult[0] == null ? oldestResult[1] as string[] : [];
		const oldest = oldestMembers.length > 0 ? Number(oldestMembers[0]) : NaN;

		const oldestInRangeResult = results?.[3];
		const oldestInRangeMembers = oldestInRangeResult && oldestInRangeResult[0] == null ? oldestInRangeResult[1] as string[] : [];
		const oldestInRange = oldestInRangeMembers.length > 0 ? Number(oldestInRangeMembers[0]) : NaN;

		const resetBaseMicro = Number.isNaN(oldestInRange) ? oldest : oldestInRange;
		const resetAt = Number.isNaN(resetBaseMicro) ? null : Math.floor((resetBaseMicro + limitation.duration * 1000) / 1000);

		return { used, max, resetAt };
	}

	@bindThis
	public async limit(limitation: IEndpointMeta['limit'] & { key: NonNullable<string> }, actor: string, factor = 1): Promise<RateLimitInfo | null> {
		if (this.disabled) {
			return null;
		}

		// Short-term limit
		if (limitation.minInterval != null) {
			const info = await this.checkLimiter({
				id: `${actor}:${limitation.key}:min`,
				duration: limitation.minInterval * factor,
				max: 1,
				db: this.redisClient,
			});

			this.logger.debug(`${actor} ${limitation.key} min remaining: ${info.remaining}`);

			if (info.remaining === 0) {
				return { code: 'BRIEF_REQUEST_INTERVAL', info };
			}
		}

		// Long term limit
		if (limitation.duration != null && limitation.max != null) {
			const info = await this.checkLimiter({
				id: `${actor}:${limitation.key}`,
				duration: limitation.duration,
				max: limitation.max / factor,
				db: this.redisClient,
			});

			this.logger.debug(`${actor} ${limitation.key} max remaining: ${info.remaining}`);

			if (info.remaining === 0) {
				return { code: 'RATE_LIMIT_EXCEEDED', info };
			}
		}

		return null;
	}
}
