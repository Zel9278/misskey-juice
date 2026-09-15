/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: 標準MIDIファイル(SMF)の最小限のパーサー。演奏(音の高さ・タイミング・長さ・音色・
// コントロールチェンジ・ピッチベンド)の再現に必要な情報だけを抜き出す。歌詞・テキスト等の
// メタ情報や、SysEx・キープレッシャー(ポリフォニック/チャンネル)の中身は再生に使わないため
// 解釈しない(スキップする)。

export type JuiceMidiNoteEvent = {
	type: 'noteOn' | 'noteOff';
	time: number; // 秒
	tick: number; // MIDIファイルの生tick値。テンポに依存しない軸(ピアノロールのスクロール)用
	track: number; // 0-indexed、元のMTrkチャンクの並び順(トラックごとのビジュアライザー色分け用)
	channel: number; // 0-15
	note: number; // 0-127
	velocity: number; // 0-127 (noteOnのみ意味を持つ)
};

export type JuiceMidiProgramChangeEvent = {
	type: 'programChange';
	time: number; // 秒
	track: number; // 0-indexed
	channel: number; // 0-15
	program: number; // 0-127 (General MIDI音色番号)
};

export type JuiceMidiControlChangeEvent = {
	type: 'controlChange';
	time: number; // 秒
	track: number; // 0-indexed
	channel: number; // 0-15
	controller: number; // 0-127 (コントローラー番号。7=チャンネルボリューム、10=パン、11=エクスプレッション、64=サステインペダル等)
	value: number; // 0-127
};

export type JuiceMidiPitchBendEvent = {
	type: 'pitchBend';
	time: number; // 秒
	track: number; // 0-indexed
	channel: number; // 0-15
	value: number; // -1(全音下限)〜0(中央)〜1(全音上限)に正規化した値
};

export type JuiceMidiTempoEvent = {
	type: 'tempo';
	time: number; // 秒
	track: number; // 0-indexed
	bpm: number;
};

export type JuiceMidiEvent = JuiceMidiNoteEvent | JuiceMidiProgramChangeEvent | JuiceMidiControlChangeEvent | JuiceMidiPitchBendEvent | JuiceMidiTempoEvent;

// JUICE: シーク時の秒→tick逆変換用のテンポ変化点。tick昇順(=time昇順)で、
// 必ず先頭に曲頭(tick 0, time 0)の要素を持つ
export type JuiceMidiTempoCheckpoint = {
	tick: number;
	time: number; // 秒
	microsPerQuarter: number;
};

// JUICE: ピアノロール表示用。noteOn/noteOffのペアを開始時刻・長さの形にまとめたもの
// (events側は発音/消音を別々のイベントとして持つため、ロール描画のたびに毎回ペアリングし
// 直さずに済むよう、パース時に1回だけ作っておく)
export type JuiceMidiNoteSpan = {
	time: number; // 秒(発音開始)
	duration: number; // 秒
	tick: number; // 発音開始(生tick値)。ピアノロールのスクロール軸はテンポに依存しないtick基準で計算する
	tickDuration: number; // 長さ(tick単位)
	track: number; // 0-indexed
	channel: number; // 0-15
	note: number; // 0-127
	velocity: number; // 0-127
};

export type JuiceMidiSong = {
	events: JuiceMidiEvent[]; // time昇順
	// JUICE: ピアノロール表示用。ノート番号(0-127)ごとにtime昇順で束ねてある(添字=ノート番号)。
	// 密集した曲でも「今の可視ウィンドウに重なるノートだけ」をノート番号単位の二分探索+
	// 打ち切りスキャンで拾えるようにするための構造(avu2-midi-infoのnote_spans[pitch]を移植)
	notesByPitch: JuiceMidiNoteSpan[][];
	// JUICE: notesByPitch[p][0..i]における終了tick(tick+tickDuration)の累積最大値。
	// 後方(過去方向)へ走査する際、この値がウィンドウの下限を下回った時点で
	// それより前のノートは全て可視ウィンドウの外と確定するため打ち切れる(同じくnote_max_end[pitch]を移植)
	notesMaxEndByPitch: number[][];
	durationSeconds: number;
	trackCount: number;
	initialBpm: number; // 最初のノート等が鳴るまでに有効なテンポ(明示的な設定が無ければ120)
	ticksPerQuarter: number; // MIDIファイルヘッダのdivision。FluidSynthのseekPlayer()が期待するtick単位と同じ
	tempoMap: JuiceMidiTempoCheckpoint[];
};

const DEFAULT_TEMPO_MICROS_PER_QUARTER = 500000; // 120bpm

class ByteReader {
	private pos = 0;
	constructor(private view: DataView) {}

	get position(): number { return this.pos; }
	get remaining(): number { return this.view.byteLength - this.pos; }

	readUint8(): number {
		const v = this.view.getUint8(this.pos);
		this.pos += 1;
		return v;
	}

	readUint16(): number {
		const v = this.view.getUint16(this.pos, false);
		this.pos += 2;
		return v;
	}

	readUint32(): number {
		const v = this.view.getUint32(this.pos, false);
		this.pos += 4;
		return v;
	}

	readInt16(): number {
		const v = this.view.getInt16(this.pos, false);
		this.pos += 2;
		return v;
	}

	readString(length: number): string {
		let s = '';
		for (let i = 0; i < length; i++) s += String.fromCharCode(this.readUint8());
		return s;
	}

	skip(length: number): void {
		this.pos += length;
	}

	// 可変長数値(Variable Length Quantity)。各バイトの最上位ビットが継続フラグ
	readVLQ(): number {
		let value = 0;
		for (let i = 0; i < 4; i++) {
			const b = this.readUint8();
			value = (value << 7) | (b & 0x7f);
			if ((b & 0x80) === 0) break;
		}
		return value >>> 0;
	}
}

type RawTrackEvent = {
	tick: number;
	kind: 'noteOn' | 'noteOff' | 'programChange' | 'tempo' | 'controlChange' | 'pitchBend';
	track: number;
	channel?: number;
	note?: number;
	velocity?: number;
	program?: number;
	microsPerQuarter?: number;
	controller?: number;
	ccValue?: number;
	pitchBendValue?: number; // 0-16383(14bit)、8192が中央
};

function parseTrack(reader: ByteReader, trackEnd: number, track: number): RawTrackEvent[] {
	// JUICE: 個々のpush()にtrackを書かせず、まとめて後付けする(既存の分岐を素通しできる)
	const events: Omit<RawTrackEvent, 'track'>[] = [];
	let tick = 0;
	let runningStatus: number | null = null;

	while (reader.position < trackEnd) {
		tick += reader.readVLQ();

		let statusByte = reader.readUint8();
		if (statusByte < 0x80) {
			// ランニングステータス: このバイトは実はデータバイトの先頭だった
			if (runningStatus == null) break; // 壊れたファイル。これ以上読めない
			reader.skip(-1);
			statusByte = runningStatus;
		} else {
			runningStatus = statusByte < 0xf0 ? statusByte : null;
		}

		const eventType = statusByte & 0xf0;
		const channel = statusByte & 0x0f;

		if (statusByte === 0xff) {
			// メタイベント
			const metaType = reader.readUint8();
			const length = reader.readVLQ();
			if (metaType === 0x51 && length === 3) {
				const microsPerQuarter = (reader.readUint8() << 16) | (reader.readUint8() << 8) | reader.readUint8();
				events.push({ tick, kind: 'tempo', microsPerQuarter });
			} else {
				reader.skip(length);
			}
		} else if (statusByte === 0xf0 || statusByte === 0xf7) {
			// SysEx: 再生に使わないため読み飛ばす
			const length = reader.readVLQ();
			reader.skip(length);
		} else if (eventType === 0x90) {
			// Note On (velocity 0はNote Off扱い)
			const note = reader.readUint8();
			const velocity = reader.readUint8();
			events.push(velocity === 0
				? { tick, kind: 'noteOff', channel, note, velocity: 0 }
				: { tick, kind: 'noteOn', channel, note, velocity });
		} else if (eventType === 0x80) {
			const note = reader.readUint8();
			const velocity = reader.readUint8();
			events.push({ tick, kind: 'noteOff', channel, note, velocity });
		} else if (eventType === 0xc0) {
			const program = reader.readUint8();
			events.push({ tick, kind: 'programChange', channel, program });
		} else if (eventType === 0xb0) {
			const controller = reader.readUint8();
			const ccValue = reader.readUint8();
			events.push({ tick, kind: 'controlChange', channel, controller, ccValue });
		} else if (eventType === 0xe0) {
			// ピッチベンド: 下位7bit→上位7bitの順(LSB first)で14bit値を構成する
			const lsb = reader.readUint8();
			const msb = reader.readUint8();
			events.push({ tick, kind: 'pitchBend', channel, pitchBendValue: (msb << 7) | lsb });
		} else if (eventType === 0xa0) {
			reader.skip(2); // Polyphonic Key Pressure: 再生に使わないため読み飛ばす
		} else if (eventType === 0xd0) {
			reader.skip(1); // Channel Pressure
		} else {
			// 未知のステータスバイト。これ以上の解釈は諦める
			break;
		}
	}

	return events.map(event => ({ ...event, track }));
}

/**
 * 標準MIDIファイル(SMF)をパースし、再生に必要な情報(音符・音色変更の絶対時刻)を抽出する。
 * SMPTEタイムコード形式(division最上位ビットが1)のファイルは対応しない(例外を投げる)。
 */
export function parseMidiFile(buffer: ArrayBuffer): JuiceMidiSong {
	const view = new DataView(buffer);
	const reader = new ByteReader(view);

	if (reader.readString(4) !== 'MThd') {
		throw new Error('Not a standard MIDI file (missing MThd header)');
	}
	const headerLength = reader.readUint32();
	const headerEnd = reader.position + headerLength;
	reader.readUint16(); // format: 再生時は複数トラックをそのまま統合して扱うため区別しない
	const trackCount = reader.readUint16();
	const division = reader.readInt16();
	reader.skip(headerEnd - reader.position);

	if (division < 0) {
		throw new Error('SMPTE-based MIDI timing is not supported');
	}
	const ticksPerQuarter = division;

	const rawEvents: RawTrackEvent[] = [];
	for (let i = 0; i < trackCount; i++) {
		if (reader.remaining < 8) break;
		if (reader.readString(4) !== 'MTrk') {
			throw new Error('Malformed MIDI file (missing MTrk header)');
		}
		const trackLength = reader.readUint32();
		const trackEnd = reader.position + trackLength;
		rawEvents.push(...parseTrack(reader, trackEnd, i));
		reader.skip(Math.max(0, trackEnd - reader.position));
	}

	// 全トラックを絶対tick順にまとめる(同時刻はtempo変更を先に適用したいのでkindでも安定ソート)
	rawEvents.sort((a, b) => a.tick - b.tick);

	// tick→秒の変換。テンポ変更のたびに基準点(累積秒・tick)を更新しながら進める
	let lastTick = 0;
	let lastSeconds = 0;
	let microsPerQuarter = DEFAULT_TEMPO_MICROS_PER_QUARTER;
	const tickToSeconds = (tick: number): number => {
		const deltaTicks = tick - lastTick;
		const deltaSeconds = (deltaTicks / ticksPerQuarter) * (microsPerQuarter / 1_000_000);
		return lastSeconds + deltaSeconds;
	};

	const events: JuiceMidiEvent[] = [];
	// JUICE: シーク時の秒→tick逆変換用。曲頭のテンポを基準点として必ず含めておく
	const tempoMap: JuiceMidiTempoCheckpoint[] = [{ tick: 0, time: 0, microsPerQuarter: DEFAULT_TEMPO_MICROS_PER_QUARTER }];
	let maxTime = 0;
	let maxTick = 0;
	// JUICE: 最初のノート等が鳴るまでに有効だったテンポをBPM表示の初期値として使う
	let initialBpm: number | null = null;
	for (const raw of rawEvents) {
		const time = tickToSeconds(raw.tick);
		lastSeconds = time;
		lastTick = raw.tick;

		if (raw.kind === 'tempo') {
			microsPerQuarter = raw.microsPerQuarter!;
			events.push({ type: 'tempo', time, track: raw.track, bpm: 60_000_000 / microsPerQuarter });
			tempoMap.push({ tick: raw.tick, time, microsPerQuarter });
		} else {
			initialBpm ??= 60_000_000 / microsPerQuarter;
			if (raw.kind === 'noteOn' || raw.kind === 'noteOff') {
				events.push({ type: raw.kind, time, tick: raw.tick, track: raw.track, channel: raw.channel!, note: raw.note!, velocity: raw.velocity ?? 0 });
			} else if (raw.kind === 'programChange') {
				events.push({ type: 'programChange', time, track: raw.track, channel: raw.channel!, program: raw.program! });
			} else if (raw.kind === 'controlChange') {
				events.push({ type: 'controlChange', time, track: raw.track, channel: raw.channel!, controller: raw.controller!, value: raw.ccValue! });
			} else if (raw.kind === 'pitchBend') {
				// 8192(14bit中央値)を0とし、-1〜1に正規化する
				events.push({ type: 'pitchBend', time, track: raw.track, channel: raw.channel!, value: (raw.pitchBendValue! - 8192) / 8192 });
			}
		}
		if (time > maxTime) maxTime = time;
		if (raw.tick > maxTick) maxTick = raw.tick;
	}

	events.sort((a, b) => a.time - b.time);

	// JUICE: ピアノロール用に、チャンネル+ノート番号ごとにnoteOn/noteOffをFIFOでペアリングする。
	// サステインペダル等の演出は無視し、生のnoteOn〜noteOffの区間だけを長さとして扱う
	const openNotesByKey = new Map<string, { time: number; tick: number; track: number; channel: number; note: number; velocity: number }[]>();
	const notes: JuiceMidiNoteSpan[] = [];
	for (const event of events) {
		if (event.type !== 'noteOn' && event.type !== 'noteOff') continue;
		const key = `${event.channel}:${event.note}`;
		if (event.type === 'noteOn') {
			let stack = openNotesByKey.get(key);
			if (stack == null) {
				stack = [];
				openNotesByKey.set(key, stack);
			}
			stack.push({ time: event.time, tick: event.tick, track: event.track, channel: event.channel, note: event.note, velocity: event.velocity });
		} else {
			const open = openNotesByKey.get(key)?.shift();
			if (open != null) {
				notes.push({
					time: open.time,
					duration: Math.max(0, event.time - open.time),
					tick: open.tick,
					tickDuration: Math.max(0, event.tick - open.tick),
					track: open.track,
					channel: open.channel,
					note: open.note,
					velocity: open.velocity,
				});
			}
		}
	}
	// JUICE: 壊れたファイル等でnoteOffが無いまま終わったノートは、曲の終わりまで伸ばして扱う
	for (const stack of openNotesByKey.values()) {
		for (const open of stack) {
			notes.push({
				time: open.time,
				duration: Math.max(0, maxTime - open.time),
				tick: open.tick,
				tickDuration: Math.max(0, maxTick - open.tick),
				track: open.track,
				channel: open.channel,
				note: open.note,
				velocity: open.velocity,
			});
		}
	}
	notes.sort((a, b) => a.time - b.time);

	// JUICE: ノート番号(0-127)ごとに束ね直し、それぞれtime昇順(=tick昇順)を保ったまま、
	// 終了tick(tick+tickDuration)の累積最大値も同時に作る(打ち切りスキャン用。ピアノロールの
	// スクロール軸はテンポに依存しないtick基準で計算するため、ここもtick基準にしてある)
	const notesByPitch: JuiceMidiNoteSpan[][] = Array.from({ length: 128 }, () => []);
	for (const note of notes) notesByPitch[note.note].push(note);
	const notesMaxEndByPitch: number[][] = notesByPitch.map(spans => {
		let runningMax = -Infinity;
		return spans.map(span => {
			runningMax = Math.max(runningMax, span.tick + span.tickDuration);
			return runningMax;
		});
	});

	return {
		events,
		notesByPitch,
		notesMaxEndByPitch,
		durationSeconds: maxTime,
		trackCount,
		initialBpm: initialBpm ?? (60_000_000 / DEFAULT_TEMPO_MICROS_PER_QUARTER),
		ticksPerQuarter,
		tempoMap,
	};
}

// JUICE: 秒→tickの変換(テンポマップを区間ごとに辿って厳密に逆算する。juice-midi-player.tsの
// private secondsToTicks()と同じ式)。ピアノロールがテンポに依存しないtick軸で滑らかに
// スクロールできるよう、呼び出し側の都合で丸めずに連続値のまま返す(FluidSynthへ渡す整数tickが
// 必要な場面は引き続きplayer側の丸め済みメソッドを使う)
export function secondsToTicks(song: Pick<JuiceMidiSong, 'tempoMap' | 'ticksPerQuarter'>, timeSeconds: number): number {
	const tempoMap = song.tempoMap;
	let checkpoint = tempoMap[0];
	for (const candidate of tempoMap) {
		if (candidate.time > timeSeconds) break;
		checkpoint = candidate;
	}
	const deltaSeconds = timeSeconds - checkpoint.time;
	const deltaTicks = deltaSeconds * song.ticksPerQuarter * 1_000_000 / checkpoint.microsPerQuarter;
	return Math.max(0, checkpoint.tick + deltaTicks);
}
