/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: 無圧縮のPNGを作る。ブラウザの canvas.toBlob('image/png') は必ず圧縮する(可逆だが)ので、
// 画素をそのまま入れた(deflateの無圧縮ブロックだけの)PNGを自前で組み立てる。
// 背景は不透明なので、アルファを落としたRGB(1画素3バイト)にする

let crcTable: Uint32Array | null = null;

function crc32(data: Uint8Array, start: number, end: number): number {
	if (crcTable == null) {
		crcTable = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
			crcTable[n] = c >>> 0;
		}
	}
	let crc = 0xffffffff;
	for (let i = start; i < end; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
	let a = 1;
	let b = 0;
	// 5552バイトごとに剰余を取れば桁あふれしない
	for (let i = 0; i < data.length;) {
		const end = Math.min(data.length, i + 5552);
		for (; i < end; i++) {
			a += data[i];
			b += a;
		}
		a %= 65521;
		b %= 65521;
	}
	return ((b << 16) | a) >>> 0;
}

function writeUint32(buf: Uint8Array, offset: number, value: number): void {
	buf[offset] = (value >>> 24) & 0xff;
	buf[offset + 1] = (value >>> 16) & 0xff;
	buf[offset + 2] = (value >>> 8) & 0xff;
	buf[offset + 3] = value & 0xff;
}

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(12 + data.length);
	writeUint32(out, 0, data.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	writeUint32(out, 8 + data.length, crc32(out, 4, 8 + data.length));
	return out;
}

export function encodeUncompressedPng(image: ImageData): Blob {
	const { width, height, data } = image;
	// 各行の先頭にフィルターの種類(0=なし)を付けた画素の並び
	const rowBytes = width * 3 + 1;
	const raw = new Uint8Array(rowBytes * height);
	for (let y = 0; y < height; y++) {
		let o = y * rowBytes + 1;
		let i = y * width * 4;
		for (let x = 0; x < width; x++, i += 4) {
			raw[o++] = data[i];
			raw[o++] = data[i + 1];
			raw[o++] = data[i + 2];
		}
	}

	// zlib(ヘッダー + 無圧縮ブロック(最大65535バイトずつ) + adler32)
	const BLOCK = 65535;
	const blockCount = Math.max(1, Math.ceil(raw.length / BLOCK));
	const zlib = new Uint8Array(2 + raw.length + blockCount * 5 + 4);
	zlib[0] = 0x78;
	zlib[1] = 0x01;
	let p = 2;
	for (let b = 0; b < blockCount; b++) {
		const start = b * BLOCK;
		const len = Math.min(BLOCK, raw.length - start);
		zlib[p++] = b === blockCount - 1 ? 1 : 0;
		zlib[p++] = len & 0xff;
		zlib[p++] = (len >>> 8) & 0xff;
		zlib[p++] = ~len & 0xff;
		zlib[p++] = (~len >>> 8) & 0xff;
		zlib.set(raw.subarray(start, start + len), p);
		p += len;
	}
	writeUint32(zlib, p, adler32(raw));

	const ihdr = new Uint8Array(13);
	writeUint32(ihdr, 0, width);
	writeUint32(ihdr, 4, height);
	ihdr[8] = 8; // 1色8ビット
	ihdr[9] = 2; // RGB
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	return new Blob([signature, chunk('IHDR', ihdr), chunk('IDAT', zlib), chunk('IEND', new Uint8Array(0))], { type: 'image/png' });
}
