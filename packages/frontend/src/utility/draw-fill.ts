/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: 絵チャのバケツ(塗りつぶし)ツール。絵チャの線は点の列で持っているので、塗りつぶす範囲を画素で求めてから、
// その輪郭を多角形(穴があれば複数の輪郭)にして、塗りつぶしの線(tool: 'fill')として描く

/**
 * 画像の(sx, sy)と似た色で、上下左右につながっている範囲を求める。範囲の画素は1、それ以外は0
 */
export function floodFillMask(image: ImageData, sx: number, sy: number, tolerance: number): Uint8Array | null {
	const { width, height, data } = image;
	if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;
	const mask = new Uint8Array(width * height);
	const seed = (sy * width + sx) * 4;
	const [r0, g0, b0, a0] = [data[seed], data[seed + 1], data[seed + 2], data[seed + 3]];
	const similar = (i: number) => {
		const o = i * 4;
		return Math.max(Math.abs(data[o] - r0), Math.abs(data[o + 1] - g0), Math.abs(data[o + 2] - b0), Math.abs(data[o + 3] - a0)) <= tolerance;
	};
	// 横に1行ずつ広げていく塗りつぶし(再帰しないので大きな範囲でも止まらない)
	const stack: number[] = [sx, sy];
	while (stack.length > 0) {
		const y = stack.pop()!;
		let x = stack.pop()!;
		let i = y * width + x;
		if (mask[i] === 1 || !similar(i)) continue;
		while (x > 0 && mask[i - 1] === 0 && similar(i - 1)) {
			x--;
			i--;
		}
		let spanUp = false;
		let spanDown = false;
		while (x < width && mask[i] === 0 && similar(i)) {
			mask[i] = 1;
			if (y > 0) {
				const up = i - width;
				const fillable = mask[up] === 0 && similar(up);
				if (fillable && !spanUp) stack.push(x, y - 1);
				spanUp = fillable;
			}
			if (y < height - 1) {
				const down = i + width;
				const fillable = mask[down] === 0 && similar(down);
				if (fillable && !spanDown) stack.push(x, y + 1);
				spanDown = fillable;
			}
			x++;
			i++;
		}
	}
	return mask;
}

/**
 * 範囲を周りにradius画素だけ広げる(線の縁のぼかしの部分に、塗り残しの隙間ができないように)
 */
export function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
	let current = mask;
	for (let step = 0; step < radius; step++) {
		const next = new Uint8Array(current);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const i = y * width + x;
				if (current[i] === 1) continue;
				if ((x > 0 && current[i - 1] === 1) || (x < width - 1 && current[i + 1] === 1) || (y > 0 && current[i - width] === 1) || (y < height - 1 && current[i + width] === 1)) {
					next[i] = 1;
				}
			}
		}
		current = next;
	}
	return current;
}

/**
 * 範囲の輪郭(画素の辺に沿った閉じた折れ線)を全て求める。外側の輪郭も、穴の輪郭も含む
 */
function traceContours(mask: Uint8Array, width: number, height: number): number[][] {
	const stride = width + 1;
	// 頂点(画素の角)から出る、範囲の縁の辺。範囲を右手に見る向きにそろえる
	const edges = new Map<number, number[]>();
	const add = (x0: number, y0: number, x1: number, y1: number) => {
		const from = y0 * stride + x0;
		const list = edges.get(from);
		if (list == null) edges.set(from, [y1 * stride + x1]);
		else list.push(y1 * stride + x1);
	};
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (mask[y * width + x] !== 1) continue;
			if (y === 0 || mask[(y - 1) * width + x] !== 1) add(x, y, x + 1, y);
			if (x === width - 1 || mask[y * width + x + 1] !== 1) add(x + 1, y, x + 1, y + 1);
			if (y === height - 1 || mask[(y + 1) * width + x] !== 1) add(x + 1, y + 1, x, y + 1);
			if (x === 0 || mask[y * width + x - 1] !== 1) add(x, y + 1, x, y);
		}
	}
	const loops: number[][] = [];
	for (const [start, ends] of edges) {
		while (ends.length > 0) {
			const loop: number[] = [start % stride, Math.floor(start / stride)];
			let current = ends.pop()!;
			while (current !== start) {
				loop.push(current % stride, Math.floor(current / stride));
				const next = edges.get(current);
				if (next == null || next.length === 0) break;
				current = next.pop()!;
			}
			if (loop.length >= 6) loops.push(loop);
		}
	}
	return loops;
}

function loopArea(loop: number[]): number {
	let area = 0;
	for (let i = 0, j = loop.length - 2; i < loop.length; j = i, i += 2) {
		area += loop[j] * loop[i + 1] - loop[i] * loop[j + 1];
	}
	return Math.abs(area) / 2;
}

// 閉じた折れ線を、形がepsilon以上変わらない範囲で少ない点にする(Ramer-Douglas-Peucker)
function simplifyLoop(loop: number[], epsilon: number): number[] {
	const count = loop.length / 2;
	if (count <= 4) return loop;
	const keep = new Uint8Array(count);
	// 閉じた線なので、始点と、始点から一番遠い点で2つに分けてから簡略化する
	let far = 0;
	let farDist = -1;
	for (let i = 1; i < count; i++) {
		const d = Math.hypot(loop[i * 2] - loop[0], loop[i * 2 + 1] - loop[1]);
		if (d > farDist) {
			farDist = d;
			far = i;
		}
	}
	keep[0] = 1;
	keep[far] = 1;
	const stack: [number, number][] = [[0, far], [far, count]];
	while (stack.length > 0) {
		const [a, b] = stack.pop()!;
		const ax = loop[a * 2];
		const ay = loop[a * 2 + 1];
		const bi = b % count;
		const bx = loop[bi * 2];
		const by = loop[bi * 2 + 1];
		const len = Math.hypot(bx - ax, by - ay);
		let maxDist = -1;
		let index = -1;
		for (let i = a + 1; i < b; i++) {
			const px = loop[i * 2];
			const py = loop[i * 2 + 1];
			const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
			if (d > maxDist) {
				maxDist = d;
				index = i;
			}
		}
		if (index !== -1 && maxDist > epsilon) {
			keep[index] = 1;
			stack.push([a, index], [index, b]);
		}
	}
	const result: number[] = [];
	for (let i = 0; i < count; i++) if (keep[i] === 1) result.push(loop[i * 2], loop[i * 2 + 1]);
	return result;
}

/**
 * 範囲を、塗りつぶしの線(tool: 'fill')の点の列にする。点の列は [x, y, 印, …] で、印が0の点から次の輪郭が始まる。
 * 点の数がmaxPointsに収まるまで、少しずつ粗く簡略化する。収まらなければnull
 */
export function maskToFillPoints(mask: Uint8Array, width: number, height: number, maxPoints: number): number[] | null {
	// ごく小さな輪郭(線の縁のぼかしで残った1画素の穴など)は捨てる
	const loops = traceContours(mask, width, height).filter(loop => loopArea(loop) >= 4);
	if (loops.length === 0) return null;
	for (const epsilon of [0.75, 1.5, 3, 6]) {
		const simplified = loops.map(loop => simplifyLoop(loop, epsilon)).filter(loop => loop.length >= 6);
		const total = simplified.reduce((sum, loop) => sum + loop.length / 2, 0);
		if (total > maxPoints) continue;
		const points: number[] = [];
		for (const loop of simplified) {
			for (let i = 0; i < loop.length; i += 2) points.push(loop[i], loop[i + 1], i === 0 ? 0 : 1);
		}
		return points;
	}
	return null;
}
