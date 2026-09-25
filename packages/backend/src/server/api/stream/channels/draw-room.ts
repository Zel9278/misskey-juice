/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { bindThis } from '@/decorators.js';
import {
	DRAW_CHAT_MAX_LENGTH,
	DRAW_ROOM_PRESENCE_HEARTBEAT_MS,
	DRAW_STROKE_MAX_POINTS,
	DRAW_STROKE_MAX_SIZE,
	DRAW_STROKE_PART_MAX_POINTS,
	DrawRoomService,
	decodeDrawPoints,
} from '@/core/DrawRoomService.js';
import type { MiDrawRoom } from '@/models/DrawRoom.js';
import type { DrawStroke } from '@/models/DrawRoomLayer.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { isJsonObject } from '@/misc/json-value.js';
import type { JsonObject, JsonValue } from '@/misc/json-value.js';
import Channel, { type ChannelRequest } from '../channel.js';

// JUICE: 接続したまま公開範囲から外れた(フォローを外された・ブロックされた)場合や、管理者が機能を
// 無効にした場合に備えて、見られるかどうかをこの間隔で確認し直す
const RECHECK_INTERVAL_MS = 1000 * 30;

/**
 * JUICE: 絵チャの部屋のストリーム。線・チャットの送信を受け付け、部屋の全員に配信する。
 * 部屋を見られない人は接続しても何も受け取れない。線を描けるのはメンバーだけで、
 * 自分のレイヤー以外には書き込めない(線は常に接続しているユーザー自身のレイヤーに入る)
 */
@Injectable({ scope: Scope.TRANSIENT })
export class DrawRoomChannel extends Channel {
	public readonly chName = 'drawRoom';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:draw-rooms';

	private room: MiDrawRoom | null = null;
	private isMember = false;
	private lastCheckedAt = 0;
	// JUICE: 部屋を開いている人(オンライン)として記録するときの、この接続のid
	private readonly presenceId = randomUUID();
	private presenceTimer: NodeJS.Timeout | null = null;
	// 画面を離れている(別のタブ・アプリを見ている)ならオフラインとして扱う
	private away = false;
	// JUICE: モデレーターが公開範囲の外から確認のために開いている。見るだけで、チャット・カーソル・
	// オンライン表示など部屋の人に見えることはしない
	private viewOnly = false;

	constructor(
		@Inject(REQUEST)
		request: ChannelRequest,

		private drawRoomService: DrawRoomService,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject) {
		if (typeof params.roomId !== 'string' || this.user == null) return;
		const room = await this.drawRoomService.getRoom(params.roomId, this.user).catch(() => null);
		if (room == null) return;
		this.room = room;
		this.isMember = await this.drawRoomService.isMember(room.id, this.user.id);
		this.lastCheckedAt = Date.now();
		this.viewOnly = !await this.drawRoomService.canView(room, this.user);
		this.subscriber.on(`drawRoomStream:${room.id}`, this.onEvent);
		if (this.viewOnly) return;
		await this.drawRoomService.enterPresence(room.id, this.user.id, this.presenceId);
		this.presenceTimer = setInterval(this.heartbeat, DRAW_ROOM_PRESENCE_HEARTBEAT_MS);
	}

	@bindThis
	private async heartbeat() {
		if (this.room == null || this.user == null) return;
		// 見られなくなっていたら(フォローを外されたなど)、ここで購読をやめてオフラインにする
		if (!await this.stillAllowed()) return;
		if (this.away) return;
		await this.drawRoomService.heartbeatPresence(this.room.id, this.user.id, this.presenceId).catch(() => {});
	}

	@bindThis
	private stopPresence(roomId: MiDrawRoom['id']) {
		if (this.presenceTimer != null) clearInterval(this.presenceTimer);
		this.presenceTimer = null;
		if (this.user != null) this.drawRoomService.leavePresence(roomId, this.user.id, this.presenceId).catch(() => {});
	}

	// JUICE: 自分に関わる出来事(参加・キック・終了)で、描けるかどうかの状態を更新してからクライアントへ流す
	@bindThis
	private onEvent(data: GlobalEvents['drawRoom']['payload']) {
		if (this.room == null || this.user == null) return;
		if (data.type === 'memberJoined' && data.body.user.id === this.user.id) this.isMember = true;
		if (data.type === 'memberLeft' && data.body.userId === this.user.id) this.isMember = false;
		if (data.type === 'ended' || data.type === 'deleted') this.room = { ...this.room, isEnded: true };
		if (data.type === 'updated') {
			const { title, maxMembers, canvasWidth, canvasHeight } = data.body.room;
			// 大きさが変わったら、線の座標の確認もその大きさで行う
			this.room = { ...this.room, title, maxMembers, canvasWidth, canvasHeight };
		}
		this.send(data);
	}

	// JUICE: 書き込み系の操作はwrite:draw-roomsの権限が必要(サードパーティーのトークンがread権限だけの場合)
	@bindThis
	private hasWritePermission(): boolean {
		const token = this.connection.token;
		return token == null || token.permission.includes('write:draw-rooms');
	}

	/**
	 * 一定間隔で、まだ部屋を見られるか(と機能が有効か)を確認し直す。見られなくなっていたら購読をやめる
	 */
	@bindThis
	private async stillAllowed(): Promise<boolean> {
		if (this.room == null || this.user == null) return false;
		if (Date.now() - this.lastCheckedAt < RECHECK_INTERVAL_MS) return true;
		this.lastCheckedAt = Date.now();
		const allowed = await this.drawRoomService.getRoom(this.room.id, this.user).then(() => true, () => false);
		if (!allowed) {
			this.subscriber.off(`drawRoomStream:${this.room.id}`, this.onEvent);
			this.stopPresence(this.room.id);
			this.room = null;
			this.isMember = false;
		}
		return allowed;
	}

	@bindThis
	private canDraw(): boolean {
		// JUICE: 引っ越し済みのアカウントは、すでにメンバーでも描けない(参加もできない)
		return this.room != null && !this.room.isEnded && this.isMember && this.user?.movedToUri == null;
	}

	/**
	 * 線の内容を検証する。座標はキャンバスの少し外側まで許す(はみ出して描いた線の端)
	 */
	@bindThis
	private parseStrokeBody(body: JsonObject, maxPoints: number): Omit<DrawStroke, 'id'> | null {
		if (this.room == null) return null;
		const { tool, color, size, opacity, points } = body;
		if (tool !== 'pen' && tool !== 'eraser') return null;
		if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
		if (typeof size !== 'number' || !Number.isFinite(size) || size < 0.5 || size > DRAW_STROKE_MAX_SIZE) return null;
		// 不透明度は省略できる(省略・1なら不透明)
		if (opacity !== undefined && (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0.05 || opacity > 1)) return null;
		if (typeof points !== 'string') return null;
		const decoded = decodeDrawPoints(points, maxPoints);
		if (decoded == null) return null;
		const margin = DRAW_STROKE_MAX_SIZE;
		for (let i = 0; i < decoded.length; i += 3) {
			const x = decoded[i];
			const y = decoded[i + 1];
			if (x < -margin || x > this.room.canvasWidth + margin || y < -margin || y > this.room.canvasHeight + margin) return null;
		}
		return {
			tool,
			color: color.toLowerCase(),
			size,
			...(opacity !== undefined && opacity < 1 ? { opacity: Math.round(opacity * 100) / 100 } : {}),
			points,
		};
	}

	@bindThis
	private isValidStrokeId(id: JsonValue | undefined): id is string {
		return typeof id === 'string' && /^[0-9a-zA-Z_-]{1,32}$/.test(id);
	}

	@bindThis
	public async onMessage(type: string, body: JsonValue) {
		if (this.room == null || this.user == null) return;
		if (!this.hasWritePermission()) return;
		if (!await this.stillAllowed()) return;
		const room = this.room;
		const user = this.user;
		if (room == null || user == null) return;
		// 確認のために開いているモデレーターは、部屋に何も書き込まない
		if (this.viewOnly) return;
		const rate = (kind: 'cursor' | 'strokePart' | 'stroke' | 'chat' | 'other') => this.drawRoomService.withinRateLimit(room.id, user.id, kind);

		switch (type) {
			case 'visibility': {
				// JUICE: 画面を離れた・戻ってきたことの知らせ。離れている間はオフラインとして扱う
				if (!isJsonObject(body) || typeof body.visible !== 'boolean') return;
				const away = !body.visible;
				if (away === this.away || !await rate('other')) return;
				this.away = away;
				if (away) {
					// 本人からの知らせなので、待たずにすぐオフラインとして配る
					await this.drawRoomService.leavePresence(room.id, user.id, this.presenceId, true);
				} else {
					await this.drawRoomService.enterPresence(room.id, user.id, this.presenceId);
				}
				break;
			}
			case 'cursor': {
				// JUICE: カーソルは見学者も含め、部屋を見ている全員が送れる(誰がどこを見ているか分かるように)
				if (room.isEnded || !isJsonObject(body)) return;
				const { x, y } = body;
				if (x === null && y === null) {
					if (!await rate('cursor')) return;
					this.drawRoomService.publishCursor(room.id, user.id, null, null);
					return;
				}
				if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
				if (x < -DRAW_STROKE_MAX_SIZE || x > room.canvasWidth + DRAW_STROKE_MAX_SIZE || y < -DRAW_STROKE_MAX_SIZE || y > room.canvasHeight + DRAW_STROKE_MAX_SIZE) return;
				if (!await rate('cursor')) return;
				this.drawRoomService.publishCursor(room.id, user.id, Math.round(x), Math.round(y));
				break;
			}
			case 'strokePart': {
				if (!this.canDraw() || !isJsonObject(body) || !this.isValidStrokeId(body.strokeId)) return;
				const part = this.parseStrokeBody(body, DRAW_STROKE_PART_MAX_POINTS);
				if (part == null || !await rate('strokePart')) return;
				this.drawRoomService.publishStrokePart(room.id, user.id, { ...part, strokeId: body.strokeId });
				break;
			}
			case 'strokeCancel': {
				if (!this.canDraw() || !isJsonObject(body) || !this.isValidStrokeId(body.strokeId)) return;
				if (!await rate('other')) return;
				this.drawRoomService.publishStrokeCancel(room.id, user.id, body.strokeId);
				break;
			}
			case 'stroke': {
				if (!this.canDraw() || !isJsonObject(body) || !this.isValidStrokeId(body.id)) return;
				const stroke = this.parseStrokeBody(body, DRAW_STROKE_MAX_POINTS);
				if (stroke == null || !await rate('stroke')) {
					// 受け付けなかった線は、途中まで表示されている分を皆の画面から消してもらう
					this.drawRoomService.publishStrokeCancel(room.id, user.id, body.id);
					return;
				}
				const added = await this.drawRoomService.addStroke(room.id, user.id, { ...stroke, id: body.id });
				if (!added) this.drawRoomService.publishStrokeCancel(room.id, user.id, body.id);
				break;
			}
			case 'undo': {
				if (!this.canDraw() || !await rate('other')) return;
				this.drawRoomService.undo(room.id, user.id);
				break;
			}
			case 'clearLayer': {
				if (!this.canDraw() || !await rate('other')) return;
				this.drawRoomService.clearLayer(room.id, user.id);
				break;
			}
			case 'chat': {
				// JUICE: チャットは見学者(メンバーでない人)も発言できる
				if (room.isEnded || user.movedToUri != null || !isJsonObject(body) || typeof body.text !== 'string') return;
				const text = body.text.trim();
				if (text.length === 0 || text.length > DRAW_CHAT_MAX_LENGTH || !await rate('chat')) return;
				this.drawRoomService.postChat(room.id, user, text);
				break;
			}
		}
	}

	@bindThis
	public dispose() {
		if (this.room != null) {
			this.subscriber.off(`drawRoomStream:${this.room.id}`, this.onEvent);
			this.stopPresence(this.room.id);
		}
	}
}
