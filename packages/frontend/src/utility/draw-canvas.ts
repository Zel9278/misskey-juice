/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

// JUICE: 絵チャの描画エンジン(Vueから独立させた、キャンバスの状態と描画だけを持つ部品)。
// ユーザーごとにレイヤー(キャンバス)を1枚ずつ持ち、表示用のキャンバスへ重ねて合成する。
// 消しゴムは自分のレイヤーにだけdestination-outで効くので、他人の線は消えない。

// サーバーとやり取りする形の線(点の列はbase64)
export type DrawStroke = Misskey.entities.DrawStroke;
export type DrawTool = DrawStroke['tool'];
// 描画に使う形の線。pointsは [x, y, 筆圧(0〜1), x, y, 筆圧, …] の平らな配列(キャンバス座標)
export type CanvasStroke = Omit<DrawStroke, 'points' | 'clip'> & { points: number[]; clip?: number[] };

type PendingStroke = CanvasStroke;

// JUICE: 描ける人数の上限の範囲(サーバーの DRAW_ROOM_MIN_MEMBERS / DRAW_ROOM_MAX_MEMBERS と同じ)
export const DRAW_ROOM_MIN_MEMBERS = 2;
export const DRAW_ROOM_MAX_MEMBERS = 512;

export function clampMaxMembers(value: number | null | undefined, fallback: number): number {
	if (value == null || !Number.isFinite(value)) return fallback;
	return Math.min(DRAW_ROOM_MAX_MEMBERS, Math.max(DRAW_ROOM_MIN_MEMBERS, Math.round(value)));
}

// JUICE: 部屋主が自由に決められるキャンバスの大きさの範囲(サーバーの DRAW_ROOM_CANVAS_MIN_SIZE / MAX_SIZE と同じ)
export const DRAW_ROOM_CANVAS_MIN_SIZE = 100;
export const DRAW_ROOM_CANVAS_MAX_SIZE = 3840;

/**
 * キャンバスの大きさを範囲内に収める。maxはロールで決まっている上限(drawRoomMaxCanvasSize)
 */
export function clampCanvasSize(value: number | null | undefined, fallback: number, max: number = DRAW_ROOM_CANVAS_MAX_SIZE): number {
	const upper = Math.max(DRAW_ROOM_CANVAS_MIN_SIZE, Math.min(DRAW_ROOM_CANVAS_MAX_SIZE, max));
	const v = value == null || !Number.isFinite(value) ? fallback : Math.round(value);
	return Math.min(upper, Math.max(DRAW_ROOM_CANVAS_MIN_SIZE, v));
}

// JUICE: 太さの上限(サーバーの DRAW_STROKE_MAX_SIZE と同じ)と、標準の大きさ(1600px)のキャンバスでの太さ
export const DRAW_STROKE_MAX_SIZE = 200;
const BASE_CANVAS_SIZE = 1600;
const BASE_MAX_BRUSH_SIZE = 60;
const BASE_DEFAULT_BRUSH_SIZE = 6;

/**
 * キャンバスの大きさに合わせた、太さのスライダーの上限と最初の太さ。
 * 大きいキャンバスでは同じ太さでも細く見えるので、長い辺に比例して大きくする(小さいキャンバスでは下げない)
 */
export function brushSizeRange(width: number, height: number): { max: number; initial: number } {
	const ratio = Math.max(1, Math.max(width, height) / BASE_CANVAS_SIZE);
	return {
		max: Math.min(DRAW_STROKE_MAX_SIZE, Math.round(BASE_MAX_BRUSH_SIZE * ratio)),
		initial: Math.round(BASE_DEFAULT_BRUSH_SIZE * ratio),
	};
}

// JUICE: 点の列の送受信・保存の形式。1点5バイトで、x・yはキャンバス座標を8倍したint16(1/8px単位)、
// 筆圧は0〜255のuint8(リトルエンディアン)。バイト列をbase64にする(サーバーの decodeDrawPoints と同じ形式)
const POINT_BYTES = 5;
export const POINT_SCALE = 8;

export function encodePoints(points: number[]): string {
	const count = Math.floor(points.length / 3);
	const view = new DataView(new ArrayBuffer(count * POINT_BYTES));
	const clampInt16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * POINT_SCALE)));
	for (let i = 0; i < count; i++) {
		const o = i * POINT_BYTES;
		view.setInt16(o, clampInt16(points[i * 3]), true);
		view.setInt16(o + 2, clampInt16(points[i * 3 + 1]), true);
		view.setUint8(o + 4, Math.round(Math.max(0, Math.min(1, points[i * 3 + 2])) * 255));
	}
	let binary = '';
	const bytes = new Uint8Array(view.buffer);
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return window.btoa(binary);
}

export function decodePoints(encoded: string): number[] {
	let binary: string;
	try {
		binary = window.atob(encoded);
	} catch {
		return [];
	}
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	const view = new DataView(bytes.buffer);
	const points: number[] = [];
	for (let o = 0; o + POINT_BYTES <= bytes.length; o += POINT_BYTES) {
		points.push(view.getInt16(o, true) / POINT_SCALE, view.getInt16(o + 2, true) / POINT_SCALE, view.getUint8(o + 4) / 255);
	}
	return points;
}

/**
 * サーバーから届いた線を描画用の形にする。移動ツールでずらした量(dx・dy)は点の列に足し込む
 */
export function decodeStroke(stroke: DrawStroke): CanvasStroke {
	const { dx, dy, clip, ...rest } = stroke;
	return {
		...rest,
		points: shiftPoints(decodePoints(stroke.points), dx ?? 0, dy ?? 0),
		// 線の中だけ塗る範囲も、線と一緒にずれている
		...(clip != null ? { clip: shiftPoints(decodePoints(clip), dx ?? 0, dy ?? 0) } : {}),
	};
}

/**
 * 描画用の線を、サーバーとやり取りする形にする(点の列・塗れる範囲をbase64に)
 */
export function encodeStroke(stroke: CanvasStroke): DrawStroke {
	const { clip, ...rest } = stroke;
	return { ...rest, points: encodePoints(stroke.points), ...(clip != null ? { clip: encodePoints(clip) } : {}) };
}

function shiftPoints(points: number[], dx: number, dy: number): number[] {
	if (dx === 0 && dy === 0) return points;
	return points.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v));
}

// 点(x, y)が多角形(平らな座標の配列)の内側にあるか
function pointInPolygon(x: number, y: number, polygon: number[]): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
		const xi = polygon[i];
		const yi = polygon[i + 1];
		const xj = polygon[j];
		const yj = polygon[j + 1];
		if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

type PendingEntry = PendingStroke & {
	updatedAt: number;
	// 重ね描き用のキャンバスに描き終えた区間の数
	drawnSegments: number;
	// 半透明の線を不透明で描いておく、この線だけのキャンバス(半透明のときだけ作る)
	canvas: HTMLCanvasElement | null;
};

// JUICE: 描いている途中のペンの線は、表示用のキャンバスとは別の重ね描き用キャンバスに、増えた分だけ描き足す。
// こうすると描いている間に表示用のキャンバス(全レイヤーの合成)を描き直さずに済む。
// 消しゴムは下の絵を消して見せる必要があるので、これまでどおりレイヤーごと描き直す
function isOverlayStroke(stroke: { tool: DrawTool }): boolean {
	return stroke.tool === 'pen';
}

// JUICE: 描いている途中の線が、この時間続きも確定も届かなければ消す(描いていた人の切断などで
// 取りやめの知らせが届かなかった場合に、途中までの線がいつまでも残らないように)
const PENDING_STROKE_TIMEOUT_MS = 20 * 1000;

type Layer = {
	userId: string;
	// 描き終わった線だけを描いたキャンバス
	committed: HTMLCanvasElement;
	// 消しゴムの途中の線も含めて描いたキャンバス。消しゴムを使うまでは作らない。
	// 一度作ったら使い回す(大きいキャンバスを作っては捨てるとブラウザが重くなり、落ちることもあるため)
	live: HTMLCanvasElement | null;
	strokes: CanvasStroke[];
	// 全体マップ用の縮小したレイヤー(描き終わった線だけ)
	thumb: HTMLCanvasElement;
	pending: Map<string, PendingEntry>;
	visible: boolean;
};

function createCanvas(width: number, height: number): HTMLCanvasElement {
	const canvas = window.document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

type StrokeShape = Pick<CanvasStroke, 'tool' | 'color' | 'size' | 'points' | 'opacity' | 'brush' | 'clip'>;

// 半透明の線を一旦不透明で描いておく作業用のキャンバス(使い回す)
let scratch: HTMLCanvasElement | null = null;

/**
 * 1本の線を描く。筆圧で線の太さを変え、点の間は中点を通る2次曲線でつないで滑らかにする。
 * 太さが区間ごとに変わるので、区間ごとに線を引いて丸い線端でつなぐ。
 * 半透明の線は、区間の重なりが濃くならないよう作業用キャンバスに不透明で描いてから、まとめて薄く重ねる
 */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: StrokeShape): void {
	// JUICE: 線の中だけ塗る(はみ出し防止)の線は、塗れる範囲の外には描かない
	if (stroke.clip != null && stroke.clip.length >= 9) {
		ctx.save();
		tracePolygon(ctx, stroke.clip);
		ctx.clip('evenodd');
		drawStrokeUnclipped(ctx, stroke);
		ctx.restore();
		return;
	}
	drawStrokeUnclipped(ctx, stroke);
}

function drawStrokeUnclipped(ctx: CanvasRenderingContext2D, stroke: StrokeShape): void {
	if (stroke.tool === 'fill') {
		drawFill(ctx, stroke);
		return;
	}
	const opacity = stroke.opacity ?? 1;
	if (opacity >= 1) {
		drawStrokePath(ctx, stroke, stroke.tool === 'eraser');
		return;
	}
	const p = stroke.points;
	if (p.length < 3) return;
	// 線がかかる範囲だけを作業用キャンバスで扱う
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (let i = 0; i < p.length; i += 3) {
		minX = Math.min(minX, p[i]);
		maxX = Math.max(maxX, p[i]);
		minY = Math.min(minY, p[i + 1]);
		maxY = Math.max(maxY, p[i + 1]);
	}
	const pad = stroke.size + 2;
	const x0 = Math.floor(Math.max(0, minX - pad));
	const y0 = Math.floor(Math.max(0, minY - pad));
	const x1 = Math.ceil(Math.min(ctx.canvas.width, maxX + pad));
	const y1 = Math.ceil(Math.min(ctx.canvas.height, maxY + pad));
	if (x1 <= x0 || y1 <= y0) return;
	const w = x1 - x0;
	const h = y1 - y0;
	scratch ??= window.document.createElement('canvas');
	if (scratch.width < w) scratch.width = w;
	if (scratch.height < h) scratch.height = h;
	const sctx = scratch.getContext('2d')!;
	sctx.clearRect(0, 0, w, h);
	sctx.save();
	sctx.translate(-x0, -y0);
	// 作業用キャンバスには消しゴムも普通の線として描き、重ねるときに消す
	drawStrokePath(sctx, stroke, false);
	sctx.restore();
	ctx.save();
	ctx.globalAlpha = opacity;
	ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
	ctx.drawImage(scratch, 0, 0, w, h, x0, y0, w, h);
	ctx.restore();
}

/**
 * JUICE: 塗りつぶしの線(囲って塗る・バケツ)を描く。点の列は多角形の頂点で、印(筆圧の値)が0の点から次の輪郭が
 * 始まる。穴のある形も塗れるよう、偶奇規則で塗る
 */
function drawFill(ctx: CanvasRenderingContext2D, stroke: StrokeShape): void {
	const p = stroke.points;
	if (p.length < 9) return;
	ctx.save();
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = stroke.opacity ?? 1;
	ctx.fillStyle = stroke.color;
	tracePolygon(ctx, p);
	ctx.fill('evenodd');
	ctx.restore();
}

// 多角形(印が0の点から次の輪郭が始まる点の列)の道筋を作る
function tracePolygon(ctx: CanvasRenderingContext2D, p: number[]): void {
	ctx.beginPath();
	for (let i = 0; i < p.length; i += 3) {
		if (i === 0 || p[i + 2] === 0) {
			if (i !== 0) ctx.closePath();
			ctx.moveTo(p[i], p[i + 1]);
		} else {
			ctx.lineTo(p[i], p[i + 1]);
		}
	}
	ctx.closePath();
}

//#region 筆の種類(JUICE)
function hexToRgb(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// にじみ筆の1回分の筆跡(ふちに向かって薄くなる丸)の濃さ。何回も重ねて描くので薄めにする
const SOFT_STAMP_ALPHA = 0.22;

/**
 * 点iの位置に、筆の種類に合わせた筆跡を1つ置く
 */
function stampAt(ctx: CanvasRenderingContext2D, stroke: StrokeShape, x: number, y: number, width: number): void {
	if (stroke.brush === 'dot') {
		// ドットは筆圧に関係なく、太さぶんの正方形の画素をくっきり塗る
		const w = Math.max(1, Math.round(stroke.size));
		const o = Math.floor(w / 2);
		ctx.fillRect(Math.floor(x) - o, Math.floor(y) - o, w, w);
		return;
	}
	const r = Math.max(0.5, width / 2);
	const [cr, cg, cb] = hexToRgb(stroke.color);
	const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
	gradient.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${SOFT_STAMP_ALPHA})`);
	gradient.addColorStop(0.6, `rgba(${cr}, ${cg}, ${cb}, ${SOFT_STAMP_ALPHA * 0.5})`);
	gradient.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.fill();
}

/**
 * ドット・にじみ筆で、区間from〜to(区間iは点i-1から点iへの直線)を描く
 */
function drawBrushLines(ctx: CanvasRenderingContext2D, stroke: StrokeShape, from: number, to: number): void {
	const p = stroke.points;
	for (let i = from; i <= to; i++) {
		const x0 = p[(i - 1) * 3];
		const y0 = p[(i - 1) * 3 + 1];
		const x1 = p[i * 3];
		const y1 = p[i * 3 + 1];
		if (stroke.brush === 'dot') {
			// 画素を1つずつたどる(Bresenham)
			let x = Math.floor(x0);
			let y = Math.floor(y0);
			const ex = Math.floor(x1);
			const ey = Math.floor(y1);
			const sx = x < ex ? 1 : -1;
			const sy = y < ey ? 1 : -1;
			const dx = Math.abs(ex - x);
			const dy = -Math.abs(ey - y);
			let err = dx + dy;
			for (;;) {
				stampAt(ctx, stroke, x, y, 0);
				if (x === ex && y === ey) break;
				const e2 = 2 * err;
				if (e2 >= dy) {
					err += dy;
					x += sx;
				}
				if (e2 <= dx) {
					err += dx;
					y += sy;
				}
			}
			continue;
		}
		// にじみ筆: 太さの12%ごとに筆跡を置く(太さは筆圧に合わせて区間の中でなめらかに変える)
		const w0 = strokeWidthAt(stroke, i - 1);
		const w1 = strokeWidthAt(stroke, i);
		const distance = Math.hypot(x1 - x0, y1 - y0);
		const steps = Math.max(1, Math.ceil(distance / Math.max(0.5, ((w0 + w1) / 2) * 0.12)));
		for (let k = 1; k <= steps; k++) {
			const t = k / steps;
			stampAt(ctx, stroke, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w0 + (w1 - w0) * t);
		}
	}
}
//#endregion

// JUICE: 点の列を(px, py)を中心にangleだけ回転する(筆圧・輪郭の印はそのまま)
export function rotatePoints(points: number[], angle: number, px: number, py: number): number[] {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	return points.map((v, i) => {
		if (i % 3 === 2) return v;
		const x = points[i - (i % 3)] - px;
		const y = points[i - (i % 3) + 1] - py;
		return i % 3 === 0 ? px + x * cos - y * sin : py + x * sin + y * cos;
	});
}

function strokeWidthAt(stroke: StrokeShape, i: number): number {
	return Math.max(0.5, stroke.size * Math.max(0.1, stroke.points[i * 3 + 2]));
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, stroke: StrokeShape, erase: boolean): void {
	ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
	ctx.strokeStyle = stroke.color;
	ctx.fillStyle = stroke.color;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
}

/**
 * 線の区間 from〜to(1始まり、区間iは点i-1から点iへ)を描く。
 * 次の点との中点を終点、点iを制御点にした2次曲線で、最後の区間(isLastTail)だけは点そのものへ引く
 */
function drawSegments(ctx: CanvasRenderingContext2D, stroke: StrokeShape, from: number, to: number, isLastTail: boolean): void {
	const p = stroke.points;
	for (let i = from; i <= to; i++) {
		const startX = i === 1 ? p[0] : (p[(i - 1) * 3] + p[i * 3]) / 2;
		const startY = i === 1 ? p[1] : (p[(i - 1) * 3 + 1] + p[i * 3 + 1]) / 2;
		const x = p[i * 3];
		const y = p[i * 3 + 1];
		const tail = isLastTail && i === to;
		const endX = tail ? x : (x + p[(i + 1) * 3]) / 2;
		const endY = tail ? y : (y + p[(i + 1) * 3 + 1]) / 2;
		ctx.beginPath();
		ctx.lineWidth = (strokeWidthAt(stroke, i - 1) + strokeWidthAt(stroke, i)) / 2;
		ctx.moveTo(startX, startY);
		ctx.quadraticCurveTo(x, y, endX, endY);
		ctx.stroke();
	}
}

function drawDot(ctx: CanvasRenderingContext2D, stroke: StrokeShape): void {
	ctx.beginPath();
	ctx.arc(stroke.points[0], stroke.points[1], strokeWidthAt(stroke, 0) / 2, 0, Math.PI * 2);
	ctx.fill();
}

function drawStrokePath(ctx: CanvasRenderingContext2D, stroke: StrokeShape, erase: boolean): void {
	const count = Math.floor(stroke.points.length / 3);
	if (count === 0) return;
	ctx.save();
	applyStrokeStyle(ctx, stroke, erase);
	if (stroke.brush === 'dot' || stroke.brush === 'soft') {
		stampAt(ctx, stroke, stroke.points[0], stroke.points[1], strokeWidthAt(stroke, 0));
		drawBrushLines(ctx, stroke, 1, count - 1);
	} else if (count === 1) {
		drawDot(ctx, stroke);
	} else {
		drawSegments(ctx, stroke, 1, count - 1, true);
	}
	ctx.restore();
}

/**
 * JUICE: 描いている途中の線を、前回から増えた分だけ描き足す(不透明な線として)。
 * 最後の区間は次の点が来るまで形が決まらないので、形が決まった区間まで描く。描いた区間の数を返す
 */
function drawStrokeIncrement(ctx: CanvasRenderingContext2D, stroke: StrokeShape, drawnSegments: number): number {
	const count = Math.floor(stroke.points.length / 3);
	if (count === 0) return drawnSegments;
	ctx.save();
	if (stroke.clip != null && stroke.clip.length >= 9) {
		tracePolygon(ctx, stroke.clip);
		ctx.clip('evenodd');
	}
	applyStrokeStyle(ctx, stroke, false);
	// ドット・にじみ筆は点と点を直線でつなぐので、届いた点までの区間は全て形が決まっている
	if (stroke.brush === 'dot' || stroke.brush === 'soft') {
		if (drawnSegments === 0) stampAt(ctx, stroke, stroke.points[0], stroke.points[1], strokeWidthAt(stroke, 0));
		if (count - 1 > drawnSegments) {
			drawBrushLines(ctx, stroke, drawnSegments + 1, count - 1);
			drawnSegments = count - 1;
		}
		ctx.restore();
		return Math.max(drawnSegments, 0);
	}
	// 描き始めは点を置いておく(1点だけの線も見えるように)
	if (drawnSegments === 0 && count >= 1) drawDot(ctx, stroke);
	// 区間iの終点は点i+1との中点なので、点がcount個なら区間count-2までは形が決まっている
	const settled = count - 2;
	if (settled > drawnSegments) {
		drawSegments(ctx, stroke, drawnSegments + 1, settled, false);
		drawnSegments = settled;
	}
	ctx.restore();
	return Math.max(drawnSegments, 0);
}

// JUICE: 全体マップの長い辺の大きさ
export const THUMBNAIL_MAX_SIZE = 160;

// 線を縮小する(全体マップ用)
function scaleStroke(stroke: CanvasStroke, scale: number): CanvasStroke {
	const scalePoints = (points: number[]) => points.map((v, i) => (i % 3 === 2 ? v : v * scale));
	return { ...stroke, size: stroke.size * scale, points: scalePoints(stroke.points), ...(stroke.clip != null ? { clip: scalePoints(stroke.clip) } : {}) };
}

export class DrawCanvasEngine {
	public readonly width: number;
	public readonly height: number;
	// 全体マップの大きさと縮小率
	public readonly thumbWidth: number;
	public readonly thumbHeight: number;
	private readonly thumbScale: number;
	private layers = new Map<string, Layer>();
	// 下から順に重ねるレイヤーの並び
	private order: string[] = [];
	private display: HTMLCanvasElement | null = null;
	private renderRequested = false;
	// 描いている途中のペンの線を描く、表示用のキャンバスの上に重ねるキャンバス(不透明な線と、半透明な線)
	private overlay: HTMLCanvasElement | null = null;
	private overlayAlpha: HTMLCanvasElement | null = null;
	private overlayRequested = false;
	// 途中の線が取り除かれたなど、重ね描き用のキャンバスを最初から描き直す必要がある
	private overlayNeedsFullRedraw = false;
	// 半透明の途中の線ごとのキャンバスを使い回すための置き場(作っては捨てるのを避ける)
	private strokeCanvasPool: HTMLCanvasElement[] = [];
	private probe: HTMLCanvasElement | null = null;
	private strokeCanvasInUse = new Set<HTMLCanvasElement>();
	private overlayAlphaDirty = false;
	// 自分のレイヤーを常に一番上に表示するか
	public myLayerOnTop = true;
	public myUserId: string | null = null;
	// JUICE: 全体マップの内容(描き終わった線・表示するレイヤー・重ね順)が変わったときに呼ぶ。
	// 全体マップは線のデータから小さいキャンバスに描き、表示用の大きいキャンバスからは読み出さない
	// (大きいキャンバスを読み出すと、ブラウザがGPUでの描画をやめてしまい、描くのが遅くなるため)
	public onThumbnailChange: (() => void) | null = null;
	// JUICE: 描き終わった線(と表示するレイヤー)が変わるたびに増やす。参照用の画像の作り直しの判断に使う
	private committedVersion = 0;
	private referenceCache: { version: number; image: ImageData } | null = null;

	private committedChanged(): void {
		this.committedVersion++;
		this.referenceCache = null;
		this.onThumbnailChange?.();
	}

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.thumbScale = THUMBNAIL_MAX_SIZE / Math.max(width, height);
		this.thumbWidth = Math.max(1, Math.round(width * this.thumbScale));
		this.thumbHeight = Math.max(1, Math.round(height * this.thumbScale));
	}

	public attach(display: HTMLCanvasElement, overlay: HTMLCanvasElement, overlayAlpha: HTMLCanvasElement): void {
		this.display = display;
		display.width = this.width;
		display.height = this.height;
		this.overlay = overlay;
		overlay.width = this.width;
		overlay.height = this.height;
		// 半透明の線を初めて描くまでは大きさを持たせない(一度大きくしたらそのまま使い回す)
		this.overlayAlpha = overlayAlpha;
		overlayAlpha.width = 1;
		overlayAlpha.height = 1;
		this.overlayNeedsFullRedraw = true;
		this.requestRender();
		this.requestOverlay();
	}

	/**
	 * 途中の線が取り除かれた・表示が変わったときに、表示用と重ね描き用の両方を描き直す
	 */
	private pendingChanged(): void {
		this.overlayNeedsFullRedraw = true;
		this.requestOverlay();
		this.requestRender();
	}

	private ensureLayer(userId: string): Layer {
		let layer = this.layers.get(userId);
		if (layer == null) {
			layer = {
				userId,
				committed: createCanvas(this.width, this.height),
				live: null,
				strokes: [],
				thumb: createCanvas(this.thumbWidth, this.thumbHeight),
				pending: new Map(),
				visible: true,
			};
			this.layers.set(userId, layer);
			this.order.push(userId);
		}
		return layer;
	}

	public get layerUserIds(): string[] {
		return [...this.order];
	}

	public isLayerVisible(userId: string): boolean {
		return this.layers.get(userId)?.visible ?? true;
	}

	public setLayerVisible(userId: string, visible: boolean): void {
		this.ensureLayer(userId).visible = visible;
		this.pendingChanged();
		this.committedChanged();
	}

	/**
	 * 自分のレイヤーを一番上に表示するかを切り替える
	 */
	public setMyLayerOnTop(value: boolean): void {
		this.myLayerOnTop = value;
		this.pendingChanged();
		this.committedChanged();
	}

	public hasStrokes(userId: string): boolean {
		return (this.layers.get(userId)?.strokes.length ?? 0) > 0;
	}

	/**
	 * サーバーから取得した全員のレイヤーで置き換える(途中参加・再接続時)
	 */
	public load(layers: { userId: string; strokes: CanvasStroke[] }[]): void {
		for (const { userId, strokes } of layers) {
			const layer = this.ensureLayer(userId);
			layer.strokes = [...strokes];
			layer.pending.clear();
			this.redrawCommitted(layer);
		}
		this.pendingChanged();
	}

	private redrawCommitted(layer: Layer): void {
		const ctx = layer.committed.getContext('2d')!;
		ctx.clearRect(0, 0, this.width, this.height);
		for (const stroke of layer.strokes) drawStroke(ctx, stroke);
		const thumbCtx = layer.thumb.getContext('2d')!;
		thumbCtx.clearRect(0, 0, this.thumbWidth, this.thumbHeight);
		for (const stroke of layer.strokes) drawStroke(thumbCtx, scaleStroke(stroke, this.thumbScale));
		this.committedChanged();
	}

	/**
	 * 描き終わった線を追加する。途中の線として表示していたものは取り除く
	 */
	public addStroke(userId: string, stroke: CanvasStroke): void {
		const layer = this.ensureLayer(userId);
		// 自分の線は送信前にローカルで確定させているので、サーバーから戻ってきた同じ線は重複させない
		if (layer.strokes.some(s => s.id === stroke.id)) return;
		const wasPending = layer.pending.delete(stroke.id);
		layer.strokes.push(stroke);
		drawStroke(layer.committed.getContext('2d')!, stroke);
		drawStroke(layer.thumb.getContext('2d')!, scaleStroke(stroke, this.thumbScale));
		if (wasPending) this.pendingChanged();
		else this.requestRender();
		this.committedChanged();
	}

	/**
	 * 描いている途中の線の続きを追加する(同じidの点をつなげていく)
	 */
	public addStrokePart(userId: string, part: PendingStroke): void {
		const layer = this.ensureLayer(userId);
		if (layer.strokes.some(s => s.id === part.id)) return;
		const pending = layer.pending.get(part.id);
		if (pending == null) {
			layer.pending.set(part.id, { ...part, points: [...part.points], updatedAt: Date.now(), drawnSegments: 0, canvas: null });
		} else {
			pending.points.push(...part.points);
			pending.updatedAt = Date.now();
		}
		if (isOverlayStroke(part)) this.requestOverlay();
		else this.requestRender();
	}

	/**
	 * 描いている途中の線を取りやめる(途中まで表示していた分を消す)
	 */
	public removePending(userId: string, strokeId: string): void {
		const layer = this.layers.get(userId);
		if (layer == null || !layer.pending.delete(strokeId)) return;
		this.pendingChanged();
	}

	/**
	 * そのユーザーの描いている途中の線を全て消す(退出・キックされたときなど)
	 */
	public clearPending(userId: string): void {
		const layer = this.layers.get(userId);
		if (layer == null || layer.pending.size === 0) return;
		layer.pending.clear();
		this.pendingChanged();
	}

	/**
	 * 長い間更新の無い途中の線を消す。定期的に呼ぶ
	 */
	public pruneStalePending(): void {
		const now = Date.now();
		let changed = false;
		for (const layer of this.layers.values()) {
			// 自分の描きかけの線は、自分で確定・取りやめを管理しているので対象外
			if (layer.userId === this.myUserId) continue;
			for (const [id, pending] of layer.pending) {
				if (now - pending.updatedAt > PENDING_STROKE_TIMEOUT_MS) {
					layer.pending.delete(id);
					changed = true;
				}
			}
		}
		if (changed) this.pendingChanged();
	}

	public removeStroke(userId: string, strokeId: string): void {
		const layer = this.layers.get(userId);
		if (layer == null) return;
		const before = layer.strokes.length;
		layer.strokes = layer.strokes.filter(s => s.id !== strokeId);
		const wasPending = layer.pending.delete(strokeId);
		if (layer.strokes.length !== before) this.redrawCommitted(layer);
		if (wasPending) this.pendingChanged();
		else this.requestRender();
	}

	//#region 選択・移動(JUICE)
	/**
	 * 範囲(矩形、または投げ縄の多角形)に点が1つでも入っている線のid
	 */
	public strokesInArea(userId: string, area: { rect: [number, number, number, number] } | { polygon: number[] }): string[] {
		const layer = this.layers.get(userId);
		if (layer == null) return [];
		const inside = 'rect' in area
			? (x: number, y: number) => x >= area.rect[0] && x <= area.rect[2] && y >= area.rect[1] && y <= area.rect[3]
			: (x: number, y: number) => pointInPolygon(x, y, area.polygon);
		return layer.strokes.filter(stroke => {
			for (let i = 0; i < stroke.points.length; i += 3) {
				if (inside(stroke.points[i], stroke.points[i + 1])) return true;
			}
			return false;
		}).map(stroke => stroke.id);
	}

	/**
	 * JUICE: 選んだ形(多角形の並び)の境目で線を切る。形の中に全部入っている線はそのまま選び、
	 * 境目をまたぐ線は内側と外側の部分に切り分けて、内側の部分を選ぶ。切れ目は境目をまたぐ2点の中点で、
	 * 両側の線がその点を共有する(切れ目に隙間ができないように)。線そのものは変えず、切り方だけを返す
	 */
	public splitByShapes(userId: string, shapes: number[][], genId: () => string): { selected: Set<string>; splits: { id: string; pieces: CanvasStroke[] }[] } {
		const selected = new Set<string>();
		const splits: { id: string; pieces: CanvasStroke[] }[] = [];
		const layer = this.layers.get(userId);
		if (layer == null || shapes.length === 0) return { selected, splits };
		const inside = (x: number, y: number) => shapes.some(shape => pointInPolygon(x, y, shape));
		// 送る形式と同じ細かさにそろえる(自分の画面とほかの人の画面で切れ目の位置がずれないように)
		const q = (v: number) => Math.round(v * POINT_SCALE) / POINT_SCALE;
		for (const stroke of layer.strokes) {
			const p = stroke.points;
			const count = Math.floor(p.length / 3);
			if (count === 0) continue;
			const flags: boolean[] = [];
			for (let i = 0; i < count; i++) flags.push(inside(p[i * 3], p[i * 3 + 1]));
			// 塗りつぶしは切ると形が崩れるので、頂点が1つでも入っていれば丸ごと選ぶ
			if (stroke.tool === 'fill' && flags.some(f => f)) {
				selected.add(stroke.id);
				continue;
			}
			if (flags.every(f => f)) {
				selected.add(stroke.id);
				continue;
			}
			if (!flags.some(f => f)) continue;
			const runs: { inside: boolean; points: number[] }[] = [];
			let current = { inside: flags[0], points: [p[0], p[1], p[2]] };
			for (let i = 1; i < count; i++) {
				const point = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
				if (flags[i] === current.inside) {
					current.points.push(...point);
					continue;
				}
				const mid = [q((p[(i - 1) * 3] + point[0]) / 2), q((p[(i - 1) * 3 + 1] + point[1]) / 2), Math.round(((p[(i - 1) * 3 + 2] + point[2]) / 2) * 255) / 255];
				current.points.push(...mid);
				runs.push(current);
				current = { inside: flags[i], points: [...mid, ...point] };
			}
			runs.push(current);
			const pieces = runs.map(run => ({ ...stroke, id: genId(), points: run.points }));
			runs.forEach((run, i) => {
				if (run.inside) selected.add(pieces[i].id);
			});
			splits.push({ id: stroke.id, pieces });
		}
		return { selected, splits };
	}

	/**
	 * JUICE: 線を、切った後の線の並びに置き換える(元の線と同じ位置に入れて、重なり順を保つ)
	 */
	public replaceStrokes(userId: string, splits: { id: string; pieces: CanvasStroke[] }[]): void {
		const layer = this.layers.get(userId);
		if (layer == null || splits.length === 0) return;
		const map = new Map(splits.map(split => [split.id, split.pieces]));
		layer.strokes = layer.strokes.flatMap(stroke => map.get(stroke.id) ?? [stroke]);
		this.redrawCommitted(layer);
		this.requestRender();
	}

	public strokesOf(userId: string): readonly CanvasStroke[] {
		return this.layers.get(userId)?.strokes ?? [];
	}

	public strokeIdsOf(userId: string): Set<string> {
		return new Set(this.layers.get(userId)?.strokes.map(stroke => stroke.id) ?? []);
	}

	/**
	 * 線をずらす(移動ツール)。idsがnullならレイヤー全体
	 */
	public moveStrokes(userId: string, ids: Set<string> | null, dx: number, dy: number): void {
		const layer = this.layers.get(userId);
		if (layer == null || (dx === 0 && dy === 0)) return;
		layer.strokes = layer.strokes.map(stroke => (ids == null || ids.has(stroke.id) ? {
			...stroke,
			points: shiftPoints(stroke.points, dx, dy),
			...(stroke.clip != null ? { clip: shiftPoints(stroke.clip, dx, dy) } : {}),
		} : stroke));
		this.redrawCommitted(layer);
		this.requestRender();
	}

	public deleteStrokes(userId: string, ids: Set<string>): void {
		const layer = this.layers.get(userId);
		if (layer == null) return;
		const before = layer.strokes.length;
		layer.strokes = layer.strokes.filter(stroke => !ids.has(stroke.id));
		if (layer.strokes.length === before) return;
		this.redrawCommitted(layer);
		this.requestRender();
	}

	// 移動ツールでドラッグしている間の表示。動かす線と動かさない線を別々のキャンバスに描いておき、
	// 表示するときに動かす線だけをずらして重ねる(ドラッグのたびに全部の線を描き直さないように)
	private moving: { userId: string; still: HTMLCanvasElement; moving: HTMLCanvasElement; dx: number; dy: number; angle: number; pivotX: number; pivotY: number } | null = null;

	public beginMove(userId: string, ids: Set<string> | null): void {
		const layer = this.layers.get(userId);
		if (layer == null) return;
		const still = createCanvas(this.width, this.height);
		const moving = createCanvas(this.width, this.height);
		const stillCtx = still.getContext('2d')!;
		const movingCtx = moving.getContext('2d')!;
		for (const stroke of layer.strokes) drawStroke(ids == null || ids.has(stroke.id) ? movingCtx : stillCtx, stroke);
		this.moving = { userId, still, moving, dx: 0, dy: 0, angle: 0, pivotX: 0, pivotY: 0 };
		this.requestRender();
	}

	public updateMove(dx: number, dy: number): void {
		if (this.moving == null) return;
		this.moving.dx = dx;
		this.moving.dy = dy;
		this.requestRender();
	}

	/**
	 * 選んだ線を(pivotX, pivotY)を中心に回転して見せる(ドラッグしている間)
	 */
	public updateRotate(angle: number, pivotX: number, pivotY: number): void {
		if (this.moving == null) return;
		this.moving.angle = angle;
		this.moving.pivotX = pivotX;
		this.moving.pivotY = pivotY;
		this.requestRender();
	}

	public endMove(): void {
		this.moving = null;
		this.requestRender();
	}
	//#endregion

	/**
	 * 自分の最後の線(undoで消える線)のid
	 */
	public lastStrokeId(userId: string): string | null {
		return this.layers.get(userId)?.strokes.at(-1)?.id ?? null;
	}

	public clearLayer(userId: string): void {
		const layer = this.layers.get(userId);
		if (layer == null) return;
		layer.strokes = [];
		layer.pending.clear();
		this.redrawCommitted(layer);
		this.pendingChanged();
	}

	private layerImage(layer: Layer): HTMLCanvasElement {
		// 移動ツールでドラッグしている間は、動かさない線の上に動かす線をずらして重ねる
		if (this.moving != null && this.moving.userId === layer.userId) {
			layer.live ??= createCanvas(this.width, this.height);
			const ctx = layer.live.getContext('2d')!;
			ctx.globalCompositeOperation = 'copy';
			ctx.drawImage(this.moving.still, 0, 0);
			ctx.globalCompositeOperation = 'source-over';
			const m = this.moving;
			ctx.save();
			ctx.translate(m.pivotX + m.dx, m.pivotY + m.dy);
			ctx.rotate(m.angle);
			ctx.translate(-m.pivotX, -m.pivotY);
			ctx.drawImage(m.moving, 0, 0);
			ctx.restore();
			return layer.live;
		}
		// ペンの途中の線は重ね描き用のキャンバスに描くので、ここでは消しゴムの途中の線だけを扱う
		const erasing = [...layer.pending.values()].filter(stroke => !isOverlayStroke(stroke));
		if (erasing.length === 0) return layer.committed;
		layer.live ??= createCanvas(this.width, this.height);
		const ctx = layer.live.getContext('2d')!;
		ctx.globalCompositeOperation = 'copy';
		ctx.drawImage(layer.committed, 0, 0);
		ctx.globalCompositeOperation = 'source-over';
		for (const stroke of erasing) drawStroke(ctx, stroke);
		return layer.live;
	}

	private requestOverlay(): void {
		if (this.overlayRequested || this.overlay == null) return;
		this.overlayRequested = true;
		window.requestAnimationFrame(() => {
			this.overlayRequested = false;
			this.renderOverlay();
		});
	}

	/**
	 * 描いている途中のペンの線を、重ね描き用のキャンバスに描き足す。
	 * 不透明な線は増えた区間だけを描き足し、半透明な線は線ごとのキャンバスに描き足してから薄く重ねる
	 */
	private renderOverlay(): void {
		const overlay = this.overlay;
		const overlayAlpha = this.overlayAlpha;
		if (overlay == null || overlayAlpha == null) return;
		const ctx = overlay.getContext('2d')!;
		const full = this.overlayNeedsFullRedraw;
		this.overlayNeedsFullRedraw = false;
		if (full) ctx.clearRect(0, 0, this.width, this.height);

		// 取り除かれた途中の線のキャンバスは、置き場に戻して次の線で使い回す
		const inUse = new Set<HTMLCanvasElement>();
		for (const layer of this.layers.values()) {
			for (const entry of layer.pending.values()) if (entry.canvas != null) inUse.add(entry.canvas);
		}
		for (const canvas of this.strokeCanvasInUse) {
			if (!inUse.has(canvas) && this.strokeCanvasPool.length < 4) this.strokeCanvasPool.push(canvas);
		}
		this.strokeCanvasInUse = inUse;

		const translucent: PendingEntry[] = [];
		for (const layer of this.orderedLayers()) {
			if (!layer.visible) continue;
			for (const entry of layer.pending.values()) {
				if (!isOverlayStroke(entry)) continue;
				if ((entry.opacity ?? 1) < 1) {
					if (entry.canvas == null) {
						entry.canvas = this.strokeCanvasPool.pop() ?? createCanvas(this.width, this.height);
						entry.canvas.getContext('2d')!.clearRect(0, 0, this.width, this.height);
						entry.drawnSegments = 0;
						this.strokeCanvasInUse.add(entry.canvas);
					} else if (full) {
						entry.canvas.getContext('2d')!.clearRect(0, 0, this.width, this.height);
						entry.drawnSegments = 0;
					}
					entry.drawnSegments = drawStrokeIncrement(entry.canvas.getContext('2d')!, entry, entry.drawnSegments);
					translucent.push(entry);
				} else {
					if (full) entry.drawnSegments = 0;
					entry.drawnSegments = drawStrokeIncrement(ctx, entry, entry.drawnSegments);
				}
			}
		}

		if (translucent.length === 0) {
			// 大きさはそのままにして、中身だけ消す
			if (this.overlayAlphaDirty) {
				overlayAlpha.getContext('2d')!.clearRect(0, 0, overlayAlpha.width, overlayAlpha.height);
				this.overlayAlphaDirty = false;
			}
			return;
		}
		if (overlayAlpha.width !== this.width || overlayAlpha.height !== this.height) {
			overlayAlpha.width = this.width;
			overlayAlpha.height = this.height;
		}
		this.overlayAlphaDirty = true;
		const actx = overlayAlpha.getContext('2d')!;
		actx.clearRect(0, 0, this.width, this.height);
		for (const entry of translucent) {
			actx.globalAlpha = entry.opacity ?? 1;
			actx.drawImage(entry.canvas!, 0, 0);
		}
		actx.globalAlpha = 1;
	}

	private orderedLayers(): Layer[] {
		const ids = [...this.order];
		if (this.myLayerOnTop && this.myUserId != null && ids.includes(this.myUserId)) {
			ids.splice(ids.indexOf(this.myUserId), 1);
			ids.push(this.myUserId);
		}
		return ids.map(id => this.layers.get(id)!);
	}

	/**
	 * 白い背景の上に、表示するレイヤーを下から順に重ねる
	 */
	private composite(ctx: CanvasRenderingContext2D, onlyVisible: boolean): void {
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, this.width, this.height);
		for (const layer of this.orderedLayers()) {
			if (onlyVisible && !layer.visible) continue;
			ctx.drawImage(this.layerImage(layer), 0, 0);
		}
	}

	public requestRender(): void {
		if (this.renderRequested || this.display == null) return;
		this.renderRequested = true;
		window.requestAnimationFrame(() => {
			this.renderRequested = false;
			if (this.display == null) return;
			this.composite(this.display.getContext('2d')!, true);
		});
	}

	/**
	 * 画面に表示している絵(表示中のレイヤーを重ねたもの)の、その位置の色を #rrggbb で返す(スポイト)
	 */
	public pickColor(x: number, y: number): string | null {
		const px = Math.floor(x);
		const py = Math.floor(y);
		if (px < 0 || py < 0 || px >= this.width || py >= this.height) return null;
		// 表示用のキャンバスからは読み出さず(GPUでの描画が止まらないように)、その1点だけを小さいキャンバスに重ねて読む
		this.probe ??= createCanvas(1, 1);
		const ctx = this.probe.getContext('2d', { willReadFrequently: true })!;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, 1, 1);
		for (const layer of this.orderedLayers()) {
			if (!layer.visible) continue;
			ctx.drawImage(this.layerImage(layer), px, py, 1, 1, 0, 0, 1, 1);
		}
		const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
		return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
	}

	/**
	 * JUICE: バケツツールが色を調べるための、表示している絵(表示中のレイヤーを白い背景に重ねたもの)の画素
	 */
	public referenceImage(): ImageData {
		// JUICE: 大きなキャンバスでは合成・読み出しが重い(3840×3840で約59MB)ので、線が変わるまで使い回す
		// (「線の中だけ塗る」では描き始めるたびに使うため)。使う側は画素を書き換えないこと
		if (this.referenceCache != null && this.referenceCache.version === this.committedVersion) return this.referenceCache.image;
		const canvas = createCanvas(this.width, this.height);
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
		this.composite(ctx, true);
		const image = ctx.getImageData(0, 0, this.width, this.height);
		this.referenceCache = { version: this.committedVersion, image };
		return image;
	}

	/**
	 * 全体マップを描く(表示中のレイヤーの、描き終わった線だけ)
	 */
	public renderThumbnail(target: HTMLCanvasElement): void {
		const ctx = target.getContext('2d')!;
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, target.width, target.height);
		for (const layer of this.orderedLayers()) {
			if (!layer.visible) continue;
			ctx.drawImage(layer.thumb, 0, 0, target.width, target.height);
		}
	}

	/**
	 * 全員のレイヤーを重ねた画像のキャンバスを作る(保存用)。非表示にしているレイヤーも含め、
	 * 描き終わった線だけを使う(描いている途中の線は含めず、ほかの人の画面にも影響しない)。
	 * areaを指定すると、その範囲だけを切り出す
	 */
	public renderImage(area?: { x: number; y: number; width: number; height: number }): HTMLCanvasElement {
		const x = Math.max(0, Math.floor(area?.x ?? 0));
		const y = Math.max(0, Math.floor(area?.y ?? 0));
		const width = Math.max(1, Math.min(this.width - x, Math.round(area?.width ?? this.width)));
		const height = Math.max(1, Math.min(this.height - y, Math.round(area?.height ?? this.height)));
		const canvas = createCanvas(width, height);
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, width, height);
		for (const layer of this.orderedLayers()) {
			ctx.drawImage(layer.committed, x, y, width, height, 0, 0, width, height);
		}
		return canvas;
	}

	public dispose(): void {
		this.moving = null;
		this.referenceCache = null;
		this.display = null;
		this.overlay = null;
		this.overlayAlpha = null;
		this.strokeCanvasPool = [];
		this.strokeCanvasInUse.clear();
		this.layers.clear();
		this.order = [];
	}
}
