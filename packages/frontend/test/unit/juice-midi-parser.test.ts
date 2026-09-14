/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { parseMidiFile } from '@/utility/juice-midi-parser.js';

function bytesToBuffer(bytes: number[]): ArrayBuffer {
	return new Uint8Array(bytes).buffer;
}

// division=96(ticks/quarter)、フォーマット0・1トラックの最小限のヘッダー
const HEADER = [
	0x4d, 0x54, 0x68, 0x64, // "MThd"
	0x00, 0x00, 0x00, 0x06, // length=6
	0x00, 0x00, // format 0
	0x00, 0x01, // ntrks=1
	0x00, 0x60, // division=96
];

function trackChunk(data: number[]): number[] {
	const length = data.length;
	return [
		0x4d, 0x54, 0x72, 0x6b, // "MTrk"
		(length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff,
		...data,
	];
}

describe('parseMidiFile', () => {
	test('テンポ・ノートオン・ノートオフを絶対時刻(秒)に変換できる', () => {
		const track = trackChunk([
			0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // delta=0, Set Tempo=500000(120bpm)
			0x00, 0x90, 0x3c, 0x64, // delta=0, Note On ch0 note60 vel100
			0x60, 0x80, 0x3c, 0x00, // delta=96(=1拍後), Note Off ch0 note60
			0x00, 0xff, 0x2f, 0x00, // delta=0, End of Track
		]);

		const song = parseMidiFile(bytesToBuffer([...HEADER, ...track]));

		expect(song.events).toStrictEqual([
			{ type: 'tempo', time: 0, track: 0, bpm: 120 },
			{ type: 'noteOn', time: 0, track: 0, channel: 0, note: 60, velocity: 100 },
			{ type: 'noteOff', time: 0.5, track: 0, channel: 0, note: 60, velocity: 0 },
		]);
		expect(song.durationSeconds).toBe(0.5);
		expect(song.trackCount).toBe(1);
		expect(song.initialBpm).toBe(120);
	});

	test('明示的なテンポ指定が無いファイルはinitialBpmが既定の120になる', () => {
		const track = trackChunk([
			0x00, 0x90, 0x3c, 0x64, // Note On note60 vel100
			0x00, 0xff, 0x2f, 0x00,
		]);

		const song = parseMidiFile(bytesToBuffer([...HEADER, ...track]));

		expect(song.initialBpm).toBe(120);
	});

	test('ランニングステータス(2つ目以降のノートオンでステータスバイトが省略される)を解釈できる', () => {
		const track = trackChunk([
			0x00, 0x90, 0x3c, 0x64, // delta=0, Note On ch0 note60 vel100 (明示的なステータスバイト)
			0x00, 0x40, 0x64, // delta=0, note64 vel100 (ステータスバイト省略、直前のNote Onを継続)
			0x00, 0xff, 0x2f, 0x00, // End of Track
		]);

		const song = parseMidiFile(bytesToBuffer([...HEADER, ...track]));

		expect(song.events).toStrictEqual([
			{ type: 'noteOn', time: 0, track: 0, channel: 0, note: 60, velocity: 100 },
			{ type: 'noteOn', time: 0, track: 0, channel: 0, note: 64, velocity: 100 },
		]);
	});

	test('velocity0のNote OnはNote Offとして扱われる', () => {
		const track = trackChunk([
			0x00, 0x90, 0x3c, 0x64, // Note On note60 vel100
			0x60, 0x90, 0x3c, 0x00, // delta=96, Note On note60 vel0 (=Note Off)
			0x00, 0xff, 0x2f, 0x00,
		]);

		const song = parseMidiFile(bytesToBuffer([...HEADER, ...track]));

		expect(song.events[1]).toStrictEqual({ type: 'noteOff', time: 0.5, track: 0, channel: 0, note: 60, velocity: 0 });
	});

	test('コントロールチェンジをそのまま抽出できる(ボリューム・サステイン等の解釈はプレイヤー側の責務)', () => {
		const track = trackChunk([
			0x00, 0xb0, 0x07, 0x64, // delta=0, CC7(Volume)=100 ch0
			0x00, 0xb0, 0x40, 0x7f, // delta=0, CC64(Sustain)=127 ch0
			0x00, 0xff, 0x2f, 0x00,
		]);

		const song = parseMidiFile(bytesToBuffer([...HEADER, ...track]));

		expect(song.events).toStrictEqual([
			{ type: 'controlChange', time: 0, track: 0, channel: 0, controller: 7, value: 100 },
			{ type: 'controlChange', time: 0, track: 0, channel: 0, controller: 64, value: 127 },
		]);
	});

	test('ピッチベンドの14bit値を-1〜1(8192=中央)に正規化して抽出できる', () => {
		const track = trackChunk([
			0x00, 0xe0, 0x00, 0x40, // delta=0, Pitch Bend ch0 = 8192(中央)
			0x00, 0xe0, 0x7f, 0x7f, // delta=0, Pitch Bend ch0 = 16383(最大)
			0x00, 0xe0, 0x00, 0x00, // delta=0, Pitch Bend ch0 = 0(最小)
			0x00, 0xff, 0x2f, 0x00,
		]);

		const song = parseMidiFile(bytesToBuffer([...HEADER, ...track]));

		expect(song.events).toStrictEqual([
			{ type: 'pitchBend', time: 0, track: 0, channel: 0, value: 0 },
			{ type: 'pitchBend', time: 0, track: 0, channel: 0, value: 8191 / 8192 },
			{ type: 'pitchBend', time: 0, track: 0, channel: 0, value: -1 },
		]);
	});

	test('MThdヘッダーが無いファイルは例外を投げる', () => {
		expect(() => parseMidiFile(bytesToBuffer([0x00, 0x00, 0x00, 0x00]))).toThrow();
	});

	test('SMPTEタイムコード形式(divisionが負)は例外を投げる', () => {
		const header = [...HEADER];
		header[12] = 0xe7; // division上位バイトの最上位ビットを立てて負の値にする
		const track = trackChunk([0x00, 0xff, 0x2f, 0x00]);
		expect(() => parseMidiFile(bytesToBuffer([...header, ...track]))).toThrow();
	});
});
