/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: 絵チャ(お絵かきチャット)のe2eテスト。公開範囲・人数上限・部屋主だけができる操作・
// ストリーム経由の線(メンバーだけが自分のレイヤーに描ける)・終了後の保存を検証する
import * as assert from 'assert';
import { describe, beforeAll, test, vi } from 'vitest';
import type { SignupSuccessResponse } from 'misskey-js/entities.js';
import type WebSocket from 'ws';
import { api, connectStream, role, signup } from '../utils.js';

type DrawRoom = { id: string; ownerId: string; members: { id: string }[]; isMember: boolean; isEnded: boolean; maxMembers: number; keepAfterEnd: boolean };

async function createRoom(user: SignupSuccessResponse, params: Partial<{ title: string; visibility: 'followers' | 'local'; maxMembers: number; canvasPreset: 'landscape' | 'portrait' | 'square' | 'square2048' | 'square3840'; keepAfterEnd: boolean }> = {}): Promise<DrawRoom> {
	const res = await api('draw-rooms/create', {
		title: 'test room',
		visibility: 'local',
		maxMembers: 4,
		canvasPreset: 'landscape',
		...params,
	}, user);
	assert.strictEqual(res.status, 200, JSON.stringify(res.body));
	return res.body as DrawRoom;
}

// JUICE: エラー時のレスポンス(error.code)も見たいので、bodyの型を付けずに呼ぶ
async function call(endpoint: string, params: Record<string, unknown>, user: SignupSuccessResponse): Promise<{ status: number; body: any }> {
	return await api(endpoint as any, params as any, user) as { status: number; body: any };
}

function sendToChannel(ws: WebSocket, type: string, body: unknown): void {
	ws.send(JSON.stringify({ type: 'ch', body: { id: 'a', type, body } }));
}

// 点の列を送る形式(1点5バイト: x・yは8倍したint16、筆圧は0〜255のuint8をbase64)にする
function encodePoints(points: [number, number, number][]): string {
	const buf = Buffer.alloc(points.length * 5);
	points.forEach(([x, y, pressure], i) => {
		buf.writeInt16LE(Math.round(x * 8), i * 5);
		buf.writeInt16LE(Math.round(y * 8), i * 5 + 2);
		buf.writeUInt8(Math.round(pressure * 255), i * 5 + 4);
	});
	return buf.toString('base64');
}

function stroke(id: string) {
	return { id, tool: 'pen', color: '#112233', size: 4, points: encodePoints([[10, 10, 0.5], [20, 20, 0.8], [30, 25, 1]]) };
}

async function layersOf(room: DrawRoom, user: SignupSuccessResponse) {
	const res = await api('draw-rooms/strokes', { roomId: room.id }, user);
	assert.strictEqual(res.status, 200);
	return res.body as { userId: string; strokes: { id: string }[] }[];
}

describe('絵チャ', () => {
	let alice: SignupSuccessResponse;
	let bob: SignupSuccessResponse;
	let carol: SignupSuccessResponse;
	let dave: SignupSuccessResponse;

	beforeAll(async () => {
		alice = await signup();
		bob = await signup();
		carol = await signup();
		dave = await signup();
		// bobだけがaliceをフォローしている
		await call('following/create', { userId: alice.id }, bob);
	}, 1000 * 60 * 2);

	test('部屋を作ると、部屋主がメンバーになる。開催中の部屋は1人1つまで', async () => {
		const room = await createRoom(alice);
		assert.strictEqual(room.ownerId, alice.id);
		assert.deepStrictEqual(room.members.map(m => m.id), [alice.id]);
		assert.strictEqual(room.isMember, true);

		const second = await call('draw-rooms/create', { title: 'second', visibility: 'local', maxMembers: 2, canvasPreset: 'square' }, alice);
		assert.strictEqual(second.status, 400);
		assert.strictEqual(second.body.error.code, 'ALREADY_HOSTING');

		await call('draw-rooms/end', { roomId: room.id }, alice);
	});

	test('フォロワー限定の部屋は、フォロワー以外は見られない', async () => {
		const room = await createRoom(alice, { visibility: 'followers' });

		assert.strictEqual((await call('draw-rooms/show', { roomId: room.id }, bob)).status, 200);
		const denied = await call('draw-rooms/show', { roomId: room.id }, carol);
		assert.strictEqual(denied.status, 400);
		assert.strictEqual(denied.body.error.code, 'FORBIDDEN');
		assert.strictEqual((await call('draw-rooms/join', { roomId: room.id }, carol)).body.error.code, 'FORBIDDEN');

		const listForCarol = (await call('draw-rooms/list', {}, carol)).body as DrawRoom[];
		assert.strictEqual(listForCarol.some(r => r.id === room.id), false);
		const listForBob = (await call('draw-rooms/list', {}, bob)).body as DrawRoom[];
		assert.strictEqual(listForBob.some(r => r.id === room.id), true);

		await call('draw-rooms/end', { roomId: room.id }, alice);
	});

	test('人数上限までしか参加できず、同時に参加しても上限を超えない', async () => {
		const room = await createRoom(alice, { maxMembers: 2 });

		// 空きは1人分。3人が同時に参加しても、成功するのは1人だけ
		const results = await Promise.all([bob, carol, dave].map(u => call('draw-rooms/join', { roomId: room.id }, u)));
		assert.strictEqual(results.filter(r => r.status === 204).length, 1);
		assert.strictEqual(results.filter(r => r.status === 400 && r.body.error.code === 'ROOM_FULL').length, 2);

		const shown = (await call('draw-rooms/show', { roomId: room.id }, alice)).body as DrawRoom;
		assert.strictEqual(shown.members.length, 2);

		// 部屋主が上限を上げれば、見学者だった人も参加できる
		// 上限は512人まで
		assert.strictEqual((await call('draw-rooms/update', { roomId: room.id, maxMembers: 513 }, alice)).status, 400);
		assert.strictEqual((await call('draw-rooms/update', { roomId: room.id, maxMembers: 512 }, alice)).status, 200);
		await call('draw-rooms/update', { roomId: room.id, maxMembers: 4 }, alice);
		const loser = [bob, carol, dave].find(u => !shown.members.some(m => m.id === u.id))!;
		assert.strictEqual((await call('draw-rooms/join', { roomId: room.id }, loser)).status, 204);

		await call('draw-rooms/end', { roomId: room.id }, alice);
	});

	test('部屋主以外は、設定の変更・メンバーのキック・終了ができない', async () => {
		const room = await createRoom(alice);
		await call('draw-rooms/join', { roomId: room.id }, bob);

		assert.strictEqual((await call('draw-rooms/update', { roomId: room.id, title: 'x' }, bob)).body.error.code, 'NOT_OWNER');
		assert.strictEqual((await call('draw-rooms/kick', { roomId: room.id, userId: alice.id }, bob)).body.error.code, 'NOT_OWNER');
		assert.strictEqual((await call('draw-rooms/end', { roomId: room.id }, bob)).body.error.code, 'NOT_OWNER');
		assert.strictEqual((await call('draw-rooms/leave', { roomId: room.id }, alice)).body.error.code, 'OWNER_CANNOT_LEAVE');

		assert.strictEqual((await call('draw-rooms/kick', { roomId: room.id, userId: bob.id }, alice)).status, 204);
		const shown = (await call('draw-rooms/show', { roomId: room.id }, bob)).body as DrawRoom;
		assert.strictEqual(shown.isMember, false);
		// 外された人は、その部屋に参加し直せない
		assert.strictEqual((await call('draw-rooms/join', { roomId: room.id }, bob)).body.error.code, 'KICKED');

		await call('draw-rooms/end', { roomId: room.id }, alice);
	});

	test('線は自分のレイヤーにだけ入り、見学者は描けない。取り消しは自分の線だけ', async () => {
		const room = await createRoom(alice);
		await call('draw-rooms/join', { roomId: room.id }, bob);

		const aliceWs = await connectStream(alice, 'drawRoom', () => {}, { roomId: room.id });
		const bobWs = await connectStream(bob, 'drawRoom', () => {}, { roomId: room.id });
		const carolWs = await connectStream(carol, 'drawRoom', () => {}, { roomId: room.id });
		try {
			sendToChannel(aliceWs, 'stroke', stroke('alice1'));
			sendToChannel(bobWs, 'stroke', stroke('bob1'));
			sendToChannel(bobWs, 'stroke', stroke('bob2'));
			// carolはメンバーではない(見学者)ので無視される
			sendToChannel(carolWs, 'stroke', stroke('carol1'));

			await vi.waitFor(async () => {
				const layers = await layersOf(room, alice);
				assert.deepStrictEqual(layers.find(l => l.userId === alice.id)?.strokes.map(s => s.id), ['alice1']);
				assert.deepStrictEqual(layers.find(l => l.userId === bob.id)?.strokes.map(s => s.id), ['bob1', 'bob2']);
			}, { timeout: 5000, interval: 200 });
			assert.strictEqual((await layersOf(room, alice)).some(l => l.userId === carol.id), false);

			// aliceの取り消しはaliceのレイヤーにしか効かない
			sendToChannel(aliceWs, 'undo', {});
			await vi.waitFor(async () => {
				const layers = await layersOf(room, alice);
				assert.deepStrictEqual(layers.find(l => l.userId === alice.id)?.strokes ?? [], []);
				assert.deepStrictEqual(layers.find(l => l.userId === bob.id)?.strokes.map(s => s.id), ['bob1', 'bob2']);
			}, { timeout: 5000, interval: 200 });

			// 不正な線(キャンバスの外・点のバイト数が合わない・数値の配列・不透明度が範囲外)は受け付けない
			sendToChannel(bobWs, 'stroke', { ...stroke('bad1'), points: encodePoints([[4000, 4000, 1]]) });
			sendToChannel(bobWs, 'stroke', { ...stroke('bad2'), points: Buffer.alloc(4).toString('base64') });
			sendToChannel(bobWs, 'stroke', { ...stroke('bad3'), points: [10, 10, 1] });
			sendToChannel(bobWs, 'stroke', { ...stroke('bad4'), opacity: 0 });
			sendToChannel(bobWs, 'stroke', { ...stroke('bob3'), opacity: 0.5 });
			await vi.waitFor(async () => {
				const layers = await layersOf(room, alice);
				assert.deepStrictEqual(layers.find(l => l.userId === bob.id)?.strokes.map(s => s.id), ['bob1', 'bob2', 'bob3']);
			}, { timeout: 5000, interval: 200 });
			// 点の列と不透明度は送ったとおりに保存される
			const bob3 = (await layersOf(room, alice)).find(l => l.userId === bob.id)?.strokes.at(-1) as { points: string; opacity?: number } | undefined;
			assert.strictEqual(bob3?.points, stroke('bob3').points);
			assert.strictEqual(bob3?.opacity, 0.5);
		} finally {
			aliceWs.close();
			bobWs.close();
			carolWs.close();
		}

		await call('draw-rooms/end', { roomId: room.id }, alice);
	});

	test('カーソルは一定間隔でまとめて配られ、各ユーザーの最新の位置だけが届く', async () => {
		const room = await createRoom(alice);
		const received: { userId: string; x: number | null; y: number | null }[][] = [];
		const bobWs = await connectStream(bob, 'drawRoom', (msg) => {
			if (msg.type === 'cursors') received.push(msg.body.cursors);
		}, { roomId: room.id });
		const aliceWs = await connectStream(alice, 'drawRoom', () => {}, { roomId: room.id });
		// carolはメンバーではない(見学者)が、カーソルは送れる
		const carolWs = await connectStream(carol, 'drawRoom', () => {}, { roomId: room.id });
		try {
			for (let i = 1; i <= 5; i++) sendToChannel(aliceWs, 'cursor', { x: i * 10, y: i * 20 });
			sendToChannel(carolWs, 'cursor', { x: 7, y: 8 });
			await vi.waitFor(() => {
				const latest = new Map(received.flat().map(c => [c.userId, c]));
				assert.deepStrictEqual(latest.get(alice.id), { userId: alice.id, x: 50, y: 100 });
				assert.deepStrictEqual(latest.get(carol.id), { userId: carol.id, x: 7, y: 8 });
			}, { timeout: 5000, interval: 100 });
			// 1件ずつではなく、まとめて届いている
			assert.ok(received.length < 6, `received ${received.length} messages`);

			// キャンバスの外に出たことも届く
			sendToChannel(aliceWs, 'cursor', { x: null, y: null });
			await vi.waitFor(() => {
				assert.deepStrictEqual(received.at(-1)?.find(c => c.userId === alice.id), { userId: alice.id, x: null, y: null });
			}, { timeout: 5000, interval: 100 });
		} finally {
			aliceWs.close();
			bobWs.close();
			carolWs.close();
		}
		await call('draw-rooms/end', { roomId: room.id }, alice);
	});

	test('部屋を開いている人(オンライン)の一覧が配られ、画面を離れる・閉じるとオフラインになる', async () => {
		const room = await createRoom(alice);
		const presence: string[][] = [];
		const aliceWs = await connectStream(alice, 'drawRoom', (msg) => {
			if (msg.type === 'presence') presence.push(msg.body.userIds);
		}, { roomId: room.id });
		try {
			await vi.waitFor(() => {
				assert.deepStrictEqual(presence.at(-1), [alice.id]);
			}, { timeout: 5000, interval: 100 });

			// 見学者(メンバーでない人)も、開いている間はオンライン
			const carolWs = await connectStream(carol, 'drawRoom', () => {}, { roomId: room.id });
			await vi.waitFor(() => {
				assert.deepStrictEqual([...(presence.at(-1) ?? [])].sort(), [alice.id, carol.id].sort());
			}, { timeout: 5000, interval: 100 });

			// 画面を離れた(本人から知らせがあった)ときはすぐオフライン、戻るとオンライン
			sendToChannel(carolWs, 'visibility', { visible: false });
			await vi.waitFor(() => {
				assert.deepStrictEqual(presence.at(-1), [alice.id]);
			}, { timeout: 2000, interval: 100 });
			sendToChannel(carolWs, 'visibility', { visible: true });
			await vi.waitFor(() => {
				assert.deepStrictEqual([...(presence.at(-1) ?? [])].sort(), [alice.id, carol.id].sort());
			}, { timeout: 5000, interval: 100 });

			// 知らせなしに接続が切れたときは、少し待ってからオフラインになる
			carolWs.close();
			await vi.waitFor(() => {
				assert.deepStrictEqual(presence.at(-1), [alice.id]);
			}, { timeout: 8000, interval: 100 });
		} finally {
			aliceWs.close();
		}
		await call('draw-rooms/end', { roomId: room.id }, alice);
	});

	test('キャンバスの大きさを自由に指定でき、部屋主は途中で変えられる', async () => {
		// 範囲外の大きさは作れない
		assert.strictEqual((await call('draw-rooms/create', { title: 'x', visibility: 'local', maxMembers: 2, canvasWidth: 5000, canvasHeight: 500 }, alice)).status, 400);

		const created = await call('draw-rooms/create', { title: 'custom', visibility: 'local', maxMembers: 4, canvasWidth: 640, canvasHeight: 480 }, alice);
		assert.strictEqual(created.status, 200);
		const room = created.body as DrawRoom & { canvasWidth: number; canvasHeight: number };
		assert.strictEqual(room.canvasWidth, 640);
		assert.strictEqual(room.canvasHeight, 480);

		await call('draw-rooms/join', { roomId: room.id }, bob);
		assert.strictEqual((await call('draw-rooms/update', { roomId: room.id, canvasWidth: 1000 }, bob)).body.error.code, 'NOT_OWNER');

		const aliceWs = await connectStream(alice, 'drawRoom', () => {}, { roomId: room.id });
		try {
			// 今の大きさ(640)の外すぎる線は受け付けない
			sendToChannel(aliceWs, 'stroke', { ...stroke('before'), points: encodePoints([[950, 100, 1]]) });
			const updated = await call('draw-rooms/update', { roomId: room.id, canvasWidth: 1000 }, alice);
			assert.strictEqual(updated.status, 200);
			assert.strictEqual(updated.body.canvasWidth, 1000);
			// 大きくした後は、広がった所にも描ける(ストリームも新しい大きさで確認する)
			await vi.waitFor(async () => {
				sendToChannel(aliceWs, 'stroke', { ...stroke(`after${Date.now()}`), points: encodePoints([[950, 100, 1]]) });
				const layers = await layersOf(room, alice);
				assert.ok(layers.find(l => l.userId === alice.id)?.strokes.some(s => s.id.startsWith('after')));
			}, { timeout: 5000, interval: 300 });
			const ids = (await layersOf(room, alice)).find(l => l.userId === alice.id)?.strokes.map(s => s.id) ?? [];
			assert.strictEqual(ids.includes('before'), false);
		} finally {
			aliceWs.close();
		}
		await call('draw-rooms/end', { roomId: room.id }, alice);
	});

	test('ロールのcanCreateDrawRoomがオフの人は部屋を作れないが、ほかの人の部屋には参加できる', async () => {
		const noCreate = await role(alice, { isModerator: false, name: 'Draw Room No Create' }, {
			canCreateDrawRoom: { priority: 0, useDefault: false, value: false },
		});
		await call('admin/roles/assign', { userId: carol.id, roleId: noCreate.id }, alice);

		const denied = await call('draw-rooms/create', { title: 'nope', visibility: 'local', maxMembers: 2, canvasPreset: 'square' }, carol);
		assert.strictEqual(denied.status, 400);
		assert.strictEqual(denied.body.error.code, 'CANNOT_CREATE_DRAW_ROOM');

		const room = await createRoom(alice);
		assert.strictEqual((await call('draw-rooms/join', { roomId: room.id }, carol)).status, 204);

		await call('draw-rooms/end', { roomId: room.id }, alice);
		await call('admin/roles/unassign', { userId: carol.id, roleId: noCreate.id }, alice);
	});

	test('ロールのdrawRoomMaxCanvasSizeを超える大きさでは作れず、途中でも超えるようには変えられない', async () => {
		// aliceは最初に登録したユーザー(管理者)なので、ロールを作ってdaveに付ける
		const limited = await role(alice, { isModerator: false, name: 'Draw Room Small Canvas' }, {
			drawRoomMaxCanvasSize: { priority: 0, useDefault: false, value: 800 },
		});
		await call('admin/roles/assign', { userId: dave.id, roleId: limited.id }, alice);

		const tooLarge = await call('draw-rooms/create', { title: 'big', visibility: 'local', maxMembers: 2, canvasPreset: 'landscape' }, dave);
		assert.strictEqual(tooLarge.status, 400);
		assert.strictEqual(tooLarge.body.error.code, 'CANVAS_TOO_LARGE');

		const ok = await call('draw-rooms/create', { title: 'small', visibility: 'local', maxMembers: 2, canvasWidth: 800, canvasHeight: 600 }, dave);
		assert.strictEqual(ok.status, 200);
		assert.strictEqual((await call('draw-rooms/update', { roomId: ok.body.id, canvasWidth: 801 }, dave)).body.error.code, 'CANVAS_TOO_LARGE');
		assert.strictEqual((await call('draw-rooms/update', { roomId: ok.body.id, canvasWidth: 500 }, dave)).status, 200);

		await call('draw-rooms/end', { roomId: ok.body.id }, dave);
		await call('admin/roles/unassign', { userId: dave.id, roleId: limited.id }, alice);
	});

	test('部屋主は自分を外せず、終了した部屋ではメンバーを外せない。幅・高さの片方だけの指定はエラー', async () => {
		const onlyWidth = await call('draw-rooms/create', { title: 'x', visibility: 'local', maxMembers: 2, canvasWidth: 800 }, alice);
		assert.strictEqual(onlyWidth.body.error.code, 'INVALID_CANVAS_SIZE');

		const room = await createRoom(alice, { keepAfterEnd: true });
		await call('draw-rooms/join', { roomId: room.id }, bob);
		assert.strictEqual((await call('draw-rooms/kick', { roomId: room.id, userId: alice.id }, alice)).body.error.code, 'CANNOT_KICK_OWNER');
		await call('draw-rooms/end', { roomId: room.id }, alice);
		assert.strictEqual((await call('draw-rooms/kick', { roomId: room.id, userId: bob.id }, alice)).body.error.code, 'ROOM_ENDED');
		await call('draw-rooms/delete', { roomId: room.id }, alice);
	});

	test('凍結された人の部屋は、ほかの人の一覧に出ず開けない(モデレーターは開ける)', async () => {
		// 凍結するとほかのテストに影響するので、このテスト専用のユーザーを使う
		const frozen = await signup();
		const room = await createRoom(frozen);
		assert.strictEqual((await call('draw-rooms/show', { roomId: room.id }, carol)).status, 200);
		await call('admin/suspend-user', { userId: frozen.id }, alice);
		await vi.waitFor(async () => {
			const list = (await call('draw-rooms/list', {}, carol)).body as DrawRoom[];
			assert.strictEqual(list.some(r => r.id === room.id), false);
		}, { timeout: 5000, interval: 300 });
		assert.strictEqual((await call('draw-rooms/show', { roomId: room.id }, carol)).body.error.code, 'FORBIDDEN');
		// aliceは管理者(モデレーター)なので、確かめるために開ける
		assert.strictEqual((await call('draw-rooms/show', { roomId: room.id }, alice)).status, 200);
	});

	test('モデレーターは開催中の部屋を削除でき、部屋を開いている人に知らされ、モデレーションログに残る', async () => {
		const room = await createRoom(bob);
		const events: { type: string; body: { byModerator?: boolean } }[] = [];
		const carolWs = await connectStream(carol, 'drawRoom', (msg) => events.push(msg as never), { roomId: room.id });
		try {
			// モデレーターでない人(部屋主以外)は削除できない
			assert.strictEqual((await call('draw-rooms/delete', { roomId: room.id }, carol)).body.error.code, 'NOT_OWNER');
			assert.strictEqual((await call('draw-rooms/delete', { roomId: room.id }, alice)).status, 204);
			await vi.waitFor(() => {
				assert.deepStrictEqual(events.find(e => e.type === 'deleted')?.body, { byModerator: true });
			}, { timeout: 5000, interval: 100 });
		} finally {
			carolWs.close();
		}
		assert.strictEqual((await call('draw-rooms/show', { roomId: room.id }, bob)).body.error.code, 'NO_SUCH_ROOM');
		const logs = (await call('admin/show-moderation-logs', { type: 'deleteDrawRoom' }, alice)).body as { type: string; info: { roomId: string } }[];
		assert.ok(logs.some(log => log.type === 'deleteDrawRoom' && log.info.roomId === room.id));
	});

	test('部屋(部屋主)と、部屋のチャットの発言(発言した人)を通報でき、通報した時点の内容が残る', async () => {
		const room = await createRoom(bob);
		const bobWs = await connectStream(bob, 'drawRoom', () => {}, { roomId: room.id });
		let chatId: string;
		try {
			sendToChannel(bobWs, 'chat', { text: 'bad words' });
			chatId = await vi.waitFor(async () => {
				const chat = (await call('draw-rooms/chat-history', { roomId: room.id }, carol)).body as { message: { id: string; text: string } }[];
				const found = chat.find(c => c.message.text === 'bad words');
				assert.ok(found);
				return found.message.id;
			}, { timeout: 5000, interval: 300 });
		} finally {
			bobWs.close();
		}

		// 部屋主でない人を部屋の通報先にはできない
		assert.strictEqual((await call('users/report-abuse', { userId: dave.id, comment: 'x', drawRoomId: room.id }, carol)).body.error.code, 'INVALID_TARGET_DRAW_ROOM');
		assert.strictEqual((await call('users/report-abuse', { userId: bob.id, comment: 'room', drawRoomId: room.id }, carol)).status, 204);
		// 発言した人でない人をチャットの通報先にはできない
		assert.strictEqual((await call('users/report-abuse', { userId: dave.id, comment: 'x', drawRoomId: room.id, drawRoomChatMessageId: chatId }, carol)).body.error.code, 'INVALID_TARGET_DRAW_ROOM_CHAT');
		assert.strictEqual((await call('users/report-abuse', { userId: bob.id, comment: 'chat', drawRoomId: room.id, drawRoomChatMessageId: chatId }, carol)).status, 204);

		// 部屋が消えても、通報した時点の内容は残る
		await call('draw-rooms/end', { roomId: room.id }, bob);
		const reports = (await call('admin/abuse-user-reports', { limit: 100 }, alice)).body as { comment: string; targetType: string | null; targetDrawRoom: { id: string; title: string; message: { text: string } | null } | null }[];
		const roomReport = reports.find(r => r.comment === 'room');
		const chatReport = reports.find(r => r.comment === 'chat');
		assert.strictEqual(roomReport?.targetType, 'drawRoom');
		assert.strictEqual(roomReport?.targetDrawRoom?.id, room.id);
		assert.strictEqual(chatReport?.targetType, 'drawRoomChat');
		assert.strictEqual(chatReport?.targetDrawRoom?.message?.text, 'bad words');
	});

	test('公開範囲の外のモデレーターは、見るだけで参加できない。見られない部屋や、対象の指定がおかしい通報は弾く', async () => {
		// daveのフォロワー限定の部屋。alice(管理者)もcarolもdaveをフォローしていない
		const room = await createRoom(dave, { visibility: 'followers' });

		const shown = await call('draw-rooms/show', { roomId: room.id }, alice);
		assert.strictEqual(shown.status, 200);
		assert.strictEqual(shown.body.viewOnly, true);
		assert.strictEqual((await call('draw-rooms/show', { roomId: room.id }, dave)).body.viewOnly, false);
		assert.strictEqual((await call('draw-rooms/join', { roomId: room.id }, alice)).body.error.code, 'FORBIDDEN');

		// 見られない部屋は通報できない
		assert.strictEqual((await call('users/report-abuse', { userId: dave.id, comment: 'x', drawRoomId: room.id }, carol)).body.error.code, 'INVALID_TARGET_DRAW_ROOM');
		// 対象の指定がおかしい
		const other = await createRoom(bob);
		assert.strictEqual((await call('users/report-abuse', { userId: bob.id, comment: 'x', drawRoomChatMessageId: other.id }, carol)).body.error.code, 'INVALID_TARGET_DRAW_ROOM_CHAT');
		assert.strictEqual((await call('users/report-abuse', { userId: bob.id, comment: 'x', drawRoomId: other.id, noteId: other.id }, carol)).body.error.code, 'CANNOT_SPECIFY_MULTIPLE_TARGETS');

		await call('draw-rooms/end', { roomId: room.id }, dave);
		await call('draw-rooms/end', { roomId: other.id }, bob);
	});

	test('大きいキャンバス(3840×3840)でも、端まで描いた線を受け付ける', async () => {
		const room = await createRoom(alice, { canvasPreset: 'square3840' });
		const aliceWs = await connectStream(alice, 'drawRoom', () => {}, { roomId: room.id });
		try {
			sendToChannel(aliceWs, 'stroke', { ...stroke('outside'), points: encodePoints([[3840 + 250, 10, 1]]) });
			sendToChannel(aliceWs, 'stroke', { ...stroke('corner'), points: encodePoints([[3839.875, 3839.875, 1], [3900, 3900, 0.5]]) });
			await vi.waitFor(async () => {
				const layers = await layersOf(room, alice);
				assert.deepStrictEqual(layers.find(l => l.userId === alice.id)?.strokes.map(s => s.id), ['corner']);
			}, { timeout: 5000, interval: 200 });
		} finally {
			aliceWs.close();
		}
		await call('draw-rooms/end', { roomId: room.id }, alice);
	});

	test('「保存する」部屋は終了後も線とチャットを見られ、描けない。部屋主は後から削除できる', async () => {
		const room = await createRoom(alice, { keepAfterEnd: true });
		const aliceWs = await connectStream(alice, 'drawRoom', () => {}, { roomId: room.id });
		try {
			sendToChannel(aliceWs, 'stroke', stroke('kept1'));
			sendToChannel(aliceWs, 'chat', { text: 'hello' });
			await vi.waitFor(async () => {
				const layers = await layersOf(room, alice);
				assert.deepStrictEqual(layers.find(l => l.userId === alice.id)?.strokes.map(s => s.id), ['kept1']);
			}, { timeout: 5000, interval: 200 });
		} finally {
			aliceWs.close();
		}

		const ended = (await call('draw-rooms/end', { roomId: room.id }, alice)).body as DrawRoom;
		assert.strictEqual(ended.isEnded, true);

		const layers = await layersOf(room, bob);
		assert.deepStrictEqual(layers.find(l => l.userId === alice.id)?.strokes.map(s => s.id), ['kept1']);
		const chat = (await call('draw-rooms/chat-history', { roomId: room.id }, bob)).body as { message: { text: string } }[];
		assert.deepStrictEqual(chat.map(c => c.message.text), ['hello']);

		assert.strictEqual((await call('draw-rooms/join', { roomId: room.id }, bob)).body.error.code, 'ROOM_ENDED');
		const aliceRooms = (await call('draw-rooms/list', { userId: alice.id }, bob)).body as DrawRoom[];
		assert.strictEqual(aliceRooms.some(r => r.id === room.id), true);

		assert.strictEqual((await call('draw-rooms/delete', { roomId: room.id }, bob)).body.error.code, 'NOT_OWNER');
		assert.strictEqual((await call('draw-rooms/delete', { roomId: room.id }, alice)).status, 204);
		assert.strictEqual((await call('draw-rooms/show', { roomId: room.id }, alice)).body.error.code, 'NO_SUCH_ROOM');
	});

	test('「保存しない」部屋は終了後に一覧から消える', async () => {
		const room = await createRoom(alice, { keepAfterEnd: false });
		await call('draw-rooms/end', { roomId: room.id }, alice);
		const aliceRooms = (await call('draw-rooms/list', { userId: alice.id }, alice)).body as DrawRoom[];
		assert.strictEqual(aliceRooms.some(r => r.id === room.id), false);
		// 終了していない部屋は削除できない(先に終了する)
		const active = await createRoom(alice);
		assert.strictEqual((await call('draw-rooms/delete', { roomId: active.id }, alice)).body.error.code, 'ROOM_NOT_ENDED');
		await call('draw-rooms/end', { roomId: active.id }, alice);
	});
});
