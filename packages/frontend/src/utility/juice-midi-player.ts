/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: 添付されたMIDIファイルを、外部のサウンドフォント等を一切読み込まずに
// Web Audio APIのオシレーターだけで簡易合成して再生する軽量プレイヤー。
// 音質はチップチューン風の簡素なものになるが、追加アセットのダウンロードが不要。
// GM音色ファミリーごとの質感の違い(オーケストラアレンジ等でProgram Changeを多用する曲向け)・
// コントロールチェンジ(ボリューム・エクスプレッション・パン・サステインペダル)・
// ピッチベンドにも、この軽量合成の範囲内で対応する。
//
// スケジューリングは「先読み(look-ahead)スケジューラ」方式を採る。ノート数が多い曲を
// 一度に全部scheduleAll()しようとすると、その同期処理自体に数百ms〜かかることがあり、
// その間もAudioContextの時計(currentTime)は進み続けるため、処理が終わる頃には
// 序盤の予定時刻が軒並み「過去」になって曲の冒頭にまとめて鳴ってしまう(その後何も
// 予定が残らず無音になる)。setIntervalで少し先(SCHEDULE_AHEAD_SECONDS)までの
// イベントだけを都度スケジュールすることで、これを構造的に避ける。

import type { JuiceMidiEvent, JuiceMidiSong } from '@/utility/juice-midi-parser.js';
// JUICE: AudioWorkletのモジュールURL。?worker&urlでWorkerと同じバンドル経路に乗せつつ、
// Workerインスタンス化はせずコンパイル後のJSファイルのURLだけを受け取る
import limiterWorkletUrl from '@/workers/juice-midi-limiter-processor?worker&url';

const DRUM_CHANNEL = 9; // GM: チャンネル10(0-indexedで9)は打楽器専用
const CHANNEL_COUNT = 16;
const ATTACK_SECONDS = 0.004;
const RELEASE_SECONDS = 0.05;
const MAX_NOTE_SECONDS = 4; // 対応するnoteOffが来ない壊れたファイル向けの安全装置
const SCHEDULE_AHEAD_SECONDS = 0.2; // この先何秒分まで予約しておくか
const TICK_INTERVAL_MS = 50; // スケジューラの実行間隔
const NOTE_COUNT = 128; // MIDIノート番号の範囲(0-127)
const PITCH_BEND_RANGE_SEMITONES = 2; // GMの既定値(RPN 0,0によるレンジ変更は非対応)
const PITCH_BEND_RAMP_SECONDS = 0.015; // ベンド変化を滑らかにするための短いランプ
// JUICE: コーラス用の2オシレーター重ねや和音の重なりで想定以上に音量が大きくなりがちなため、
// 共有のmediaVolume設定(他の音声/動画プレイヤーと同じ0-1のスライダー)を100%にしても
// 他のメディアと同程度の聞こえ方になるよう、出力全体に固定でかけておく減衰
const OUTPUT_HEADROOM_GAIN = 0.3;

function frequencyForNote(note: number): number {
	return 440 * Math.pow(2, (note - 69) / 12);
}

type VoiceRecipe = {
	waveform: OscillatorType;
	detuneCents?: number; // 2枚目のオシレーターを重ねる場合のデチューン量(コーラス/アンサンブル感)
	vibratoRateHz?: number;
	vibratoDepthCents?: number;
	attackSeconds?: number;
	releaseSeconds?: number;
};

// JUICE: GM音色番号(0-127)を8個区切りの「ファミリー」ごとに分け、質感の近い合成レシピを
// 割り当てる。正確な楽器再現はしないが、単一波形だけの分類より弦楽器のビブラート・
// 金管のデチューン感などファミリー間の違いが出るようにする(オーケストラアレンジで
// Program Changeを多用する曲向け)。
const VOICE_RECIPES: VoiceRecipe[] = [
	{ waveform: 'triangle' }, // 0: Piano
	{ waveform: 'triangle', attackSeconds: 0.002, releaseSeconds: 0.15 }, // 1: Chromatic Percussion(ベル/マレット系)
	{ waveform: 'sawtooth', detuneCents: 7 }, // 2: Organ(ドローバー風の厚みをデチューンで代用)
	{ waveform: 'sawtooth', detuneCents: 5, attackSeconds: 0.01 }, // 3: Guitar
	{ waveform: 'square' }, // 4: Bass(クリーンでパンチのある音)
	{ waveform: 'sawtooth', detuneCents: 8, vibratoRateHz: 5.5, vibratoDepthCents: 12, attackSeconds: 0.08 }, // 5: Strings(遅めのアタック+ビブラート)
	{ waveform: 'sawtooth', detuneCents: 14, vibratoRateHz: 5, vibratoDepthCents: 10, attackSeconds: 0.09 }, // 6: Ensemble(合唱/複数人感を強めのデチューンで)
	{ waveform: 'square', detuneCents: 6, attackSeconds: 0.015 }, // 7: Brass(セクションの厚みを軽いデチューンで)
	{ waveform: 'square', vibratoRateHz: 5, vibratoDepthCents: 8, attackSeconds: 0.02 }, // 8: Reed
	{ waveform: 'sine', vibratoRateHz: 4.5, vibratoDepthCents: 6, attackSeconds: 0.03 }, // 9: Pipe(息づかい感のある柔らかいアタック)
	{ waveform: 'sawtooth' }, // 10: Synth Lead
	{ waveform: 'triangle', detuneCents: 10, attackSeconds: 0.2, releaseSeconds: 0.3 }, // 11: Synth Pad
	{ waveform: 'sine' }, // 12: Synth Effects
	{ waveform: 'triangle', attackSeconds: 0.002, releaseSeconds: 0.12 }, // 13: Ethnic(撥弦系)
	{ waveform: 'square', attackSeconds: 0.002, releaseSeconds: 0.12 }, // 14: Percussive
	{ waveform: 'sine' }, // 15: Sound Effects
];

function voiceRecipeForProgram(program: number): VoiceRecipe {
	return VOICE_RECIPES[Math.floor(program / 8)] ?? VOICE_RECIPES[0];
}

function emptyVisualizerFrame(): JuiceMidiVisualizerFrame {
	return { levels: new Float32Array(NOTE_COUNT), tracks: new Int16Array(NOTE_COUNT).fill(-1) };
}

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
	const length = Math.floor(ctx.sampleRate * 0.2);
	const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
	return buffer;
}

type ActiveNote = {
	note: number;
	track: number;
	channel: number;
	peak: number;
	stop: (at: number) => void;
	// JUICE: ドラムチャンネル(ノイズバッファ)はピッチベンド非対応のため省略される
	setPitchBend?: (semitones: number, when: number) => void;
};

// JUICE: 現在鳴っている音をノート番号(0-127)ごとの強さ(0-1)で表した簡易ビジュアライザー用データ
export type JuiceMidiNoteLevels = Float32Array;

// JUICE: 各ノートを鳴らしている(=levelsで最も強い)トラックの番号。無音のノートは-1
export type JuiceMidiNoteTracks = Int16Array;

export type JuiceMidiVisualizerFrame = {
	levels: JuiceMidiNoteLevels;
	tracks: JuiceMidiNoteTracks;
};

export class JuiceMidiPlayer {
	private master: GainNode;
	private noiseBuffer: AudioBuffer;
	private disposed = false;
	private schedulerTimer: number | null = null;

	// JUICE: チャンネルごとのボリューム(CC7)×エクスプレッション(CC11)・パン(CC10)を
	// 反映する常設ノード。ノートごとのGainNode(ADSR)の後段でチャンネル単位にまとめて適用する
	private channelGains: GainNode[] = [];
	private channelPanners: StereoPannerNode[] = [];

	// 再生セッションの状態(曲頭からの再生開始時のみ更新し、一時停止/再開では変えない。
	// suspend中はcurrentTimeが進まないため、この基準点は一時停止をまたいでも有効なまま)
	private playbackStartContextTime = 0;
	private nextEventIndex = 0;
	private activeNotes = new Map<string, ActiveNote>();
	private programByChannel = new Map<number, number>();
	private channelVolume = new Map<number, number>(); // CC7、0-1(既定1)
	private channelExpression = new Map<number, number>(); // CC11、0-1(既定1)
	private channelPan = new Map<number, number>(); // CC10、-1〜1(既定0=中央)
	private channelPitchBend = new Map<number, number>(); // 半音単位(既定0)
	private channelSustain = new Map<number, boolean>(); // CC64、既定false
	// サステインペダルが踏まれている間、noteOffが来ても止めずに保留しているノートのキー集合
	private sustainedNotes = new Map<number, Set<string>>();

	// JUICE: 再生済みノート数(noteOnをスケジュールした数)。先読み分だけ実際の発音より
	// わずかに早く進む点はcurrentVisualizerFrame()と同様、演出・目安表示用途なので厳密さは求めない
	private playedNoteCount = 0;

	// JUICE: 最初のノート等が鳴るまでに有効なテンポ(BPM表示用)。tempoイベントを跨いだ
	// シーク・曲の再生完了で初期値に戻す
	private currentBpm: number;

	public isPlaying = false;
	public readonly duration: number;
	public readonly totalNoteCount: number;

	// JUICE: AudioContextの生成・AudioWorkletモジュールの登録が非同期のため、
	// 呼び出し側はnewではなくこのファクトリメソッドを使う。AudioContext自体は
	// 呼び出し元(クリックハンドラ)側で同期的に生成してから渡してもらう(自動再生ポリシー対策として、
	// 生成自体はユーザー操作の直接応答として行っておく)。resumeは初回play()の中で行う
	public static async create(
		ctx: AudioContext,
		song: JuiceMidiSong,
		volume: number,
		onProgress: (currentTime: number, frame: JuiceMidiVisualizerFrame, playedNoteCount: number, bpm: number) => void,
		onEnded: () => void,
	): Promise<JuiceMidiPlayer> {
		await ctx.audioWorklet.addModule(limiterWorkletUrl);
		const limiter = new AudioWorkletNode(ctx, 'juice-midi-limiter', {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			outputChannelCount: [2],
		});
		return new JuiceMidiPlayer(ctx, song, volume, limiter, onProgress, onEnded);
	}

	private constructor(
		private ctx: AudioContext,
		private song: JuiceMidiSong,
		volume: number,
		limiter: AudioWorkletNode,
		private onProgress: (currentTime: number, frame: JuiceMidiVisualizerFrame, playedNoteCount: number, bpm: number) => void,
		private onEnded: () => void,
	) {
		this.duration = song.durationSeconds;
		this.totalNoteCount = song.events.filter(event => event.type === 'noteOn').length;
		this.currentBpm = song.initialBpm;

		// JUICE: コーラス用の2オシレーター重ねや和音の重なりで信号がかなり大きくなりうるため、
		// ルックアヘッド付きピークリミッター(juice-midi-limiter-processor.ts)を安全ネットとして
		// 挟んだうえで、さらに固定の減衰(headroom)を1段噛ませる。共有のmediaVolume設定
		// (this.master側)と混同しないよう別ノードにしている
		limiter.connect(ctx.destination);

		const headroom = ctx.createGain();
		headroom.gain.value = OUTPUT_HEADROOM_GAIN;
		headroom.connect(limiter);

		this.master = ctx.createGain();
		this.master.gain.value = Math.max(0, Math.min(1, volume));
		this.master.connect(headroom);

		for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
			const channelGain = ctx.createGain();
			const channelPanner = ctx.createStereoPanner();
			channelGain.connect(channelPanner);
			channelPanner.connect(this.master);
			this.channelGains.push(channelGain);
			this.channelPanners.push(channelPanner);
		}

		this.noiseBuffer = createNoiseBuffer(ctx);
	}

	public async play(): Promise<void> {
		if (this.isPlaying || this.disposed) return;

		if (this.nextEventIndex === 0) {
			// 曲頭からの再生: 今の時計を「曲の0秒」の基準にする
			this.playbackStartContextTime = this.ctx.currentTime;
		}
		// 一時停止からの再開: suspend中はcurrentTimeが進まないため、基準点はそのままで良い

		await this.ctx.resume();
		this.isPlaying = true;
		this.startScheduler();
	}

	public async pause(): Promise<void> {
		if (!this.isPlaying) return;
		this.stopScheduler();
		await this.ctx.suspend();
		this.isPlaying = false;
	}

	public dispose(): void {
		this.stopScheduler();
		this.disposed = true;
		this.ctx.close().catch(() => {});
		this.isPlaying = false;
	}

	// JUICE: 複数のMIDIプレイヤーが同時に開かれていても、共有のメディア音量設定を
	// それぞれへ反映できるようにする。プツッというノイズを避けるため軽くランプする
	public setVolume(volume: number): void {
		if (this.disposed) return;
		const clamped = Math.max(0, Math.min(1, volume));
		this.master.gain.linearRampToValueAtTime(clamped, this.ctx.currentTime + 0.05);
	}

	// JUICE: シークバーからの移動。移動先より前の音は全て止め、音色(プログラムチェンジ)・
	// チャンネルボリューム/エクスプレッション/パン/ピッチベンド/サステインの各状態だけは
	// 移動先の直前までを反映し直す
	public seek(time: number): void {
		if (this.disposed) return;
		const clamped = Math.max(0, Math.min(time, this.duration));
		const now = this.ctx.currentTime;

		for (const note of this.activeNotes.values()) note.stop(now);
		this.activeNotes.clear();
		this.programByChannel.clear();
		this.channelVolume.clear();
		this.channelExpression.clear();
		this.channelPan.clear();
		this.channelPitchBend.clear();
		this.channelSustain.clear();
		this.sustainedNotes.clear();
		this.currentBpm = this.song.initialBpm;

		let index = 0;
		let playedNoteCount = 0;
		while (index < this.song.events.length && this.song.events[index].time < clamped) {
			const event = this.song.events[index];
			if (event.type === 'programChange') {
				this.programByChannel.set(event.channel, event.program);
			} else if (event.type === 'noteOn') {
				playedNoteCount++;
			} else if (event.type === 'controlChange') {
				this.applyControlChangeState(event.channel, event.controller, event.value);
			} else if (event.type === 'pitchBend') {
				this.channelPitchBend.set(event.channel, event.value * PITCH_BEND_RANGE_SEMITONES);
			} else if (event.type === 'tempo') {
				this.currentBpm = event.bpm;
			}
			index++;
		}
		this.nextEventIndex = index;
		this.playedNoteCount = playedNoteCount;
		this.playbackStartContextTime = now - clamped;

		// JUICE: シーク直後は自動化中のランプが残らないよう、各チャンネルのゲイン・パンを
		// 直前までの状態から即座に反映し直す(発音中のノートは既に全て停止済みのため無音のまま)
		for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
			this.channelGains[ch].gain.cancelScheduledValues(now);
			this.channelGains[ch].gain.setValueAtTime(this.resolveChannelGain(ch), now);
			this.channelPanners[ch].pan.cancelScheduledValues(now);
			this.channelPanners[ch].pan.setValueAtTime(this.channelPan.get(ch) ?? 0, now);
		}

		this.onProgress(clamped, emptyVisualizerFrame(), this.playedNoteCount, this.currentBpm);

		if (this.isPlaying) {
			this.tick();
		}
	}

	private startScheduler(): void {
		this.stopScheduler();
		this.tick();
		this.schedulerTimer = window.setInterval(() => this.tick(), TICK_INTERVAL_MS);
	}

	private stopScheduler(): void {
		if (this.schedulerTimer != null) {
			window.clearInterval(this.schedulerTimer);
			this.schedulerTimer = null;
		}
	}

	private tick(): void {
		const nowSongTime = this.ctx.currentTime - this.playbackStartContextTime;

		const scheduleUntil = nowSongTime + SCHEDULE_AHEAD_SECONDS;
		while (this.nextEventIndex < this.song.events.length && this.song.events[this.nextEventIndex].time <= scheduleUntil) {
			this.scheduleEvent(this.song.events[this.nextEventIndex]);
			this.nextEventIndex++;
		}

		this.onProgress(Math.min(nowSongTime, this.duration), this.currentVisualizerFrame(), this.playedNoteCount, this.currentBpm);

		if (nowSongTime >= this.duration) {
			this.stopScheduler();
			this.isPlaying = false;
			const end = this.ctx.currentTime;
			for (const note of this.activeNotes.values()) note.stop(end);
			this.activeNotes.clear();
			this.programByChannel.clear();
			this.channelVolume.clear();
			this.channelExpression.clear();
			this.channelPan.clear();
			this.channelPitchBend.clear();
			this.channelSustain.clear();
			this.sustainedNotes.clear();
			for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
				this.channelGains[ch].gain.cancelScheduledValues(end);
				this.channelGains[ch].gain.setValueAtTime(1, end);
				this.channelPanners[ch].pan.cancelScheduledValues(end);
				this.channelPanners[ch].pan.setValueAtTime(0, end);
			}
			// JUICE: currentTimeと同様、終了直後は最終値(全ノート再生済み)を1回通知してから
			// 次回の曲頭再生に備えてリセットする
			this.onProgress(this.duration, emptyVisualizerFrame(), this.playedNoteCount, this.currentBpm);
			this.nextEventIndex = 0;
			this.playedNoteCount = 0;
			this.currentBpm = this.song.initialBpm;
			this.onEnded();
		}
	}

	// JUICE: ビジュアライザー用。先読み分(SCHEDULE_AHEAD_SECONDS)だけ実際の発音より
	// 早めに「鳴っている」扱いになるが、演出用途なので厳密さは求めない。同じノート番号を
	// 複数トラックが同時に鳴らしている場合は、一番強い(peakが高い)トラックの色で代表させる
	private currentVisualizerFrame(): JuiceMidiVisualizerFrame {
		const frame = emptyVisualizerFrame();
		for (const active of this.activeNotes.values()) {
			if (active.peak > frame.levels[active.note]) {
				frame.levels[active.note] = active.peak;
				frame.tracks[active.note] = active.track;
			}
		}
		return frame;
	}

	private resolveChannelGain(channel: number): number {
		const volume = this.channelVolume.get(channel) ?? 1;
		const expression = this.channelExpression.get(channel) ?? 1;
		return Math.max(0, Math.min(1, volume * expression));
	}

	// JUICE: seek()での状態再構築と、リアルタイム再生中のscheduleEvent()の両方から使う
	// (リアルタイム側は戻り値を見ずMapへの反映のみ行い、音への反映は呼び出し元でwhenを使って行う)
	private applyControlChangeState(channel: number, controller: number, value: number): void {
		if (controller === 7) {
			this.channelVolume.set(channel, value / 127);
		} else if (controller === 11) {
			this.channelExpression.set(channel, value / 127);
		} else if (controller === 10) {
			this.channelPan.set(channel, Math.max(-1, Math.min(1, (value - 64) / 63)));
		} else if (controller === 64) {
			this.channelSustain.set(channel, value >= 64);
		}
	}

	// JUICE: サステインペダルが離されたとき、それまで保留していたノートをまとめて止める
	private releaseSustainedNotes(channel: number, when: number): void {
		const keys = this.sustainedNotes.get(channel);
		if (keys == null || keys.size === 0) return;
		for (const key of keys) {
			this.activeNotes.get(key)?.stop(when);
			this.activeNotes.delete(key);
		}
		keys.clear();
	}

	private scheduleEvent(event: JuiceMidiEvent): void {
		const when = this.playbackStartContextTime + event.time;

		if (event.type === 'programChange') {
			this.programByChannel.set(event.channel, event.program);
			return;
		}

		if (event.type === 'tempo') {
			this.currentBpm = event.bpm;
			return;
		}

		if (event.type === 'controlChange') {
			const wasSustained = this.channelSustain.get(event.channel) ?? false;
			this.applyControlChangeState(event.channel, event.controller, event.value);
			if (event.controller === 7 || event.controller === 11) {
				this.channelGains[event.channel].gain.linearRampToValueAtTime(this.resolveChannelGain(event.channel), when + 0.01);
			} else if (event.controller === 10) {
				this.channelPanners[event.channel].pan.linearRampToValueAtTime(this.channelPan.get(event.channel) ?? 0, when + 0.01);
			} else if (event.controller === 64 && wasSustained && !this.channelSustain.get(event.channel)) {
				this.releaseSustainedNotes(event.channel, when);
			}
			return;
		}

		if (event.type === 'pitchBend') {
			const semitones = event.value * PITCH_BEND_RANGE_SEMITONES;
			this.channelPitchBend.set(event.channel, semitones);
			for (const active of this.activeNotes.values()) {
				if (active.channel === event.channel) active.setPitchBend?.(semitones, when);
			}
			return;
		}

		const key = `${event.channel}:${event.note}`;

		if (event.type === 'noteOff') {
			if (this.channelSustain.get(event.channel)) {
				let keys = this.sustainedNotes.get(event.channel);
				if (keys == null) {
					keys = new Set();
					this.sustainedNotes.set(event.channel, keys);
				}
				keys.add(key);
			} else {
				this.activeNotes.get(key)?.stop(when);
				this.activeNotes.delete(key);
			}
			return;
		}

		// noteOn: 同じ音が既に鳴っていたら(壊れたファイル等)先に止める
		this.activeNotes.get(key)?.stop(when);
		this.sustainedNotes.get(event.channel)?.delete(key);
		this.playedNoteCount++;

		const isDrum = event.channel === DRUM_CHANNEL;
		const recipe = isDrum ? null : voiceRecipeForProgram(this.programByChannel.get(event.channel) ?? 0);
		const attackSeconds = recipe?.attackSeconds ?? ATTACK_SECONDS;
		const releaseSeconds = recipe?.releaseSeconds ?? RELEASE_SECONDS;
		// JUICE: detuneCentsが設定されているファミリーは2枚のオシレーターを重ねるため、
		// 単純に足し合わせると単一オシレーターの音色の約2倍の振幅になってしまう。
		// 等パワー則(sqrt(本数)で割る)で補正し、コーラス感は残しつつ音量差を抑える
		const voiceCount = recipe?.detuneCents ? 2 : 1;

		const noteGain = this.ctx.createGain();
		noteGain.connect(this.channelGains[event.channel]);
		const peak = Math.max(0, Math.min(1, event.velocity / 127)) / Math.sqrt(voiceCount);
		noteGain.gain.setValueAtTime(0, when);
		noteGain.gain.linearRampToValueAtTime(peak, when + attackSeconds);

		const sources: (OscillatorNode | AudioBufferSourceNode)[] = [];
		let setPitchBend: ActiveNote['setPitchBend'];

		if (recipe == null) {
			// ドラムチャンネル: ノイズバッファのみ(ピッチベンド非対応)
			const noise = this.ctx.createBufferSource();
			noise.buffer = this.noiseBuffer;
			noise.connect(noteGain);
			sources.push(noise);
		} else {
			const baseFreq = frequencyForNote(event.note);
			const initialBend = this.channelPitchBend.get(event.channel) ?? 0;
			// JUICE: ピッチベンドで周波数を動かす対象はここに入れる(LFOはビブラート「レート」なので含めない)
			const pitchedOscillators: OscillatorNode[] = [];

			const primary = this.ctx.createOscillator();
			primary.type = recipe.waveform;
			primary.frequency.setValueAtTime(baseFreq * Math.pow(2, initialBend / 12), when);
			primary.connect(noteGain);
			pitchedOscillators.push(primary);

			if (recipe.detuneCents) {
				// JUICE: 2枚目のオシレーターを軽くデチューンして重ねることで、単一波形より
				// 厚みのある(オルガンのドローバーや弦楽アンサンブルのような)音にする
				const secondary = this.ctx.createOscillator();
				secondary.type = recipe.waveform;
				secondary.frequency.setValueAtTime(baseFreq * Math.pow(2, initialBend / 12), when);
				secondary.detune.setValueAtTime(recipe.detuneCents, when);
				secondary.connect(noteGain);
				pitchedOscillators.push(secondary);
			}

			sources.push(...pitchedOscillators);

			if (recipe.vibratoRateHz && recipe.vibratoDepthCents) {
				// JUICE: LFOでdetuneを揺らすことでビブラートを表現する(弦・リード・パイプ系)。
				// start/stopの対象(sources)には含めるが、ピッチベンドの対象(pitchedOscillators)には含めない
				const lfo = this.ctx.createOscillator();
				lfo.type = 'sine';
				lfo.frequency.value = recipe.vibratoRateHz;
				const lfoGain = this.ctx.createGain();
				lfoGain.gain.value = recipe.vibratoDepthCents;
				lfo.connect(lfoGain);
				for (const osc of pitchedOscillators) lfoGain.connect(osc.detune);
				sources.push(lfo);
			}

			setPitchBend = (semitones, bendWhen) => {
				const freq = baseFreq * Math.pow(2, semitones / 12);
				for (const osc of pitchedOscillators) osc.frequency.linearRampToValueAtTime(freq, bendWhen + PITCH_BEND_RAMP_SECONDS);
			};
		}

		for (const source of sources) {
			source.start(when);
			// 対応するnoteOffが来ない壊れたファイルでも鳴りっぱなしにならないよう、既定の最大長で
			// 一旦止まるようスケジュールしておく(実際のnoteOffが来ればstopAt()がより早い時刻へ上書きする)
			source.stop(when + MAX_NOTE_SECONDS);
		}

		const stopAt = (at: number) => {
			const clamped = Math.max(at, when + attackSeconds);
			noteGain.gain.cancelScheduledValues(clamped);
			noteGain.gain.setValueAtTime(peak, clamped);
			noteGain.gain.linearRampToValueAtTime(0, clamped + releaseSeconds);
			for (const source of sources) source.stop(clamped + releaseSeconds + 0.01);
		};

		this.activeNotes.set(key, { note: event.note, track: event.track, channel: event.channel, peak, stop: stopAt, setPitchBend });
	}
}
