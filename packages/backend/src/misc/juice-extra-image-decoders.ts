/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: sharp(libvips)単体ではデコードできない画像形式(JPEG XL・HEIC/HEIF)を、
// それぞれ専用のデコーダ(WASM/Emscripten製、ネイティブ依存・別プロセス不要)でPNGへ
// 変換する。変換後は通常のPNGファイルとしてsharpにそのまま渡せるため、リサイズ・
// WebPエンコード等の既存処理はこのファイルの外では一切変更しない。
//
// 対応形式を増やす場合は、末尾のdecodeToPngIfSupported()にmime判定を1つ足すだけでよい。
// (静止画としてのプレビュー生成が目的のため、アニメーション形式でも先頭フレームのみ扱う)

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import sharp from 'sharp';

const require = createRequire(import.meta.url);

type JxlModule = typeof import('jxl-oxide-wasm');

let jxlModulePromise: Promise<JxlModule> | null = null;

// JUICE: jxl-oxide-wasmはブラウザ向けにfetch()でwasmバイナリを読み込む実装になっており、
// Node.jsのfetch()はfile:// URLに対応していないためそのままでは動かない。
// wasmバイナリを自前でreadFile()して直接init()に渡すことで回避する。
// パッケージのpackage.jsonがESM("import"条件)しか公開していないため、パスの解決には
// require.resolve()ではなくimport.meta.resolve()を使う必要がある
async function loadJxlModule(): Promise<JxlModule> {
	jxlModulePromise ??= (async () => {
		const mod: JxlModule = await import('jxl-oxide-wasm');
		const mainUrl = await import.meta.resolve('jxl-oxide-wasm');
		const wasmPath = path.join(path.dirname(fileURLToPath(mainUrl)), 'jxl_oxide_wasm_bg.wasm');
		const wasmBytes = await readFile(wasmPath);
		await mod.default({ module_or_path: wasmBytes });
		return mod;
	})();
	return jxlModulePromise;
}

async function decodeJxlToPng(buffer: Buffer): Promise<Buffer> {
	const { JxlImage } = await loadJxlModule();
	const image = new JxlImage();
	try {
		image.feedBytes(buffer);
		const initialized = image.tryInit();
		if (!initialized) throw new Error('Incomplete JXL data');

		// JUICE: encodeToPng()はRust側でRenderResultを消費する(以後は無効になる)ため、
		// ここで別途result.free()は呼ばない(二重解放でエラーになる)
		const result = image.render(0);
		return Buffer.from(result.encodeToPng());
	} finally {
		image.free();
	}
}

// JUICE: libheif-jsは複数のバリアントを持つが、Node.js向けにwasmバイナリを
// あらかじめ埋め込み済みの'wasm-bundle'を使う(別途ファイルパス解決が不要で安全)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let libheifModule: any | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadLibheifModule(): any {
	libheifModule ??= require('libheif-js/wasm-bundle');
	return libheifModule;
}

async function decodeHeifToPng(buffer: Buffer): Promise<Buffer> {
	const libheif = loadLibheifModule();
	const decoder = new libheif.HeifDecoder();
	const images = decoder.decode(buffer);
	if (images.length === 0) throw new Error('No image found in HEIF file');

	const image = images[0];
	const width: number = image.get_width();
	const height: number = image.get_height();

	const imageData = await new Promise<{ data: Uint8ClampedArray }>((resolve, reject) => {
		image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (displayData: { data: Uint8ClampedArray } | null) => {
			if (displayData == null) {
				reject(new Error('Failed to decode HEIF image'));
				return;
			}
			resolve(displayData);
		});
	});

	return await sharp(Buffer.from(imageData.data), { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/**
 * sharp/libvipsが直接デコードできない画像形式を、PNGバイト列へ変換する。
 * 対応していない形式の場合はnullを返す(呼び出し側は従来通りの処理を続ける)
 */
export async function decodeToPngIfSupported(buffer: Buffer, mime: string): Promise<Buffer | null> {
	switch (mime) {
		case 'image/jxl':
			return await decodeJxlToPng(buffer);
		case 'image/heic':
		case 'image/heif':
			return await decodeHeifToPng(buffer);
		default:
			return null;
	}
}

/** decodeToPngIfSupported()が対応しているmimeタイプの一覧 */
export const EXTRA_DECODABLE_IMAGE_MIME_TYPES = ['image/jxl', 'image/heic', 'image/heif'] as const;
