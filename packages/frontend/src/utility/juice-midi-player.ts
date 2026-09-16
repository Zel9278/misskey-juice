/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: 添付されたMIDIファイルを再生するプレイヤー。実際の音の合成はjs-synthesizer
// (BSD-3-Clause、FluidSynthをWebAssemblyへコンパイルして呼び出すラッパー。FluidSynth本体は
// 別途LGPL-2.1-only。ライセンス表記はabout-juiceページ参照)のAudioWorklet実装に丸ごと委ねる。
// FluidSynth自身のSMFプレイヤー(addSMFDataToPlayer)へ生のMIDIバイト列をそのまま渡すため、
// プログラムチェンジ・コントロールチェンジ・ピッチベンド・サステインペダル・テンポ変化は
// すべてFluidSynth側が本来のMIDI仕様通りに解釈する(このファイルでは一切再実装しない)。
//
// このファイル側で持つのは、既存のパーサー(juice-midi-parser.ts)が抜き出したイベント列を
// なぞって「今どのノートが鳴っているように見せるか」を計算するだけの、簡易ビジュアライザー用の
// 並行した帳簿(bookkeeping)。実際の発音とは完全に独立しており、両者はAudioContextの時計
// (ctx.currentTime)を共通の基準にしているだけで同期している。
//
// スケジューリングは「先読み(look-ahead)スケジューラ」方式を採る。ノート数が多い曲を
// 一度に全部なぞろうとすると、その同期処理自体に数百ms〜かかることがあり、その間も
// AudioContextの時計(currentTime)は進み続けるため、処理が終わる頃には序盤の予定時刻が
// 軒並み「過去」になってしまう。setIntervalで少し先(SCHEDULE_AHEAD_SECONDS)までの
// イベントだけを都度なぞることで、これを構造的に避ける。

import * as JSSynth from 'js-synthesizer';
import type { JuiceMidiEvent, JuiceMidiSong } from '@/utility/juice-midi-parser.js';
// JUICE: AudioWorkletのモジュールURL。?worker&urlでWorkerと同じバンドル経路に乗せつつ、
// Workerインスタンス化はせずコンパイル後のJSファイルのURLだけを受け取る
import limiterWorkletUrl from '@/workers/juice-midi-limiter-processor?worker&url';
import quietFluidsynthLogWorkletUrl from '@/workers/juice-midi-quiet-fluidsynth-log?worker&url';
import { fetchSoundfont, loadSynthesizerWorkletModules } from '@/utility/juice-midi-soundfont.js';

const SCHEDULE_AHEAD_SECONDS = 0.2; // ビジュアライザー帳簿をこの先何秒分まで先読みしておくか
const TICK_INTERVAL_MS = 50; // スケジューラの実行間隔
const NOTE_COUNT = 128; // MIDIノート番号の範囲(0-127)
// JUICE: FluidSynthのsynth.polyphony(既定256、最大65535)の既定値。和音密度が高い曲での
// ringbuffer溢れ(juice-midi-quiet-fluidsynth-log.tsで警告自体は間引いている)対策で
// 上げられるようにはしているが、上げすぎるとAudioWorkletの実時間レンダリングが追いつかず
// 無音になる(1024で実機確認済み)ため、prefer.s.midiMaxPolyphony(設定画面・MIDIプレイヤーの
// メニューから変更可能)の上限は640に抑えてある。呼び出し元が値を渡さない場合のフォールバック
const DEFAULT_MAX_POLYPHONY = 256;
// JUICE: 和音の重なりで信号がかなり大きくなりうるため、共有のmediaVolume設定
// (他の音声/動画プレイヤーと同じ0-1のスライダー)を100%にしても他のメディアと同程度の
// 聞こえ方になるよう、出力全体に固定でかけておく減衰
const OUTPUT_HEADROOM_GAIN = 0.5;

function emptyVisualizerFrame(): JuiceMidiVisualizerFrame {
	return { levels: new Float32Array(NOTE_COUNT), tracks: new Int16Array(NOTE_COUNT).fill(-1) };
}

type ActiveNote = {
	note: number;
	track: number;
	channel: number;
	peak: number;
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
	private disposed = false;
	private schedulerTimer: number | null = null;
	private playerStarted = false;

	// 再生セッションの状態(曲頭からの再生開始時のみ更新し、一時停止/再開では変えない。
	// suspend中はcurrentTimeが進まないため、この基準点は一時停止をまたいでも有効なまま)
	private playbackStartContextTime = 0;
	private nextEventIndex = 0;
	// JUICE: 先読みスケジューラでnextEventIndexまで消費(look-ahead)はするが、ビジュアライザー
	// (鍵盤ハイライト・ピアノロール)への反映は実際にそのイベントのtimeへ達してから行うための
	// 一時待避列。これが無いと、消費した瞬間(最大SCHEDULE_AHEAD_SECONDS秒早い)に鍵盤が
	// 光ってしまい、ピアノロールのノートが鍵盤へ「当たる」タイミングとズレて見える
	private pendingVisualizerEvents: JuiceMidiEvent[] = [];
	// JUICE: ビジュアライザー帳簿専用。実際の発音状態(FluidSynth内部)とは独立している。
	// サステインペダル(CC64)で実際の発音が延びていても、鍵盤ハイライトはnoteOff(鍵を離した
	// タイミング)で消す(FluidSynth側の音自体はサステインの仕様通り鳴り続ける)
	private activeNotes = new Map<string, ActiveNote>();

	// JUICE: 再生済みノート数(noteOnをなぞった数)。pendingVisualizerEventsを介すため、
	// 実際にそのノートの発音タイミングへ達してから増える
	private playedNoteCount = 0;

	// JUICE: 最初のノート等が鳴るまでに有効なテンポ(BPM表示用)。tempoイベントを跨いだ
	// シーク・曲の再生完了で初期値に戻す
	private currentBpm: number;

	public isPlaying = false;
	public readonly duration: number;
	public readonly totalNoteCount: number;

	// JUICE: AudioContextの生成・AudioWorkletモジュールの登録・サウンドフォントの読み込みが
	// 非同期のため、呼び出し側はnewではなくこのファクトリメソッドを使う。AudioContext自体は
	// 呼び出し元(クリックハンドラ)側で同期的に生成してから渡してもらう(自動再生ポリシー対策として、
	// 生成自体はユーザー操作の直接応答として行っておく)。resumeは初回play()の中で行う
	public static async create(
		ctx: AudioContext,
		song: JuiceMidiSong,
		midiData: ArrayBuffer,
		volume: number,
		onProgress: (currentTime: number, frame: JuiceMidiVisualizerFrame, playedNoteCount: number, bpm: number, activeNoteCount: number) => void,
		onEnded: () => void,
		maxPolyphony: number = DEFAULT_MAX_POLYPHONY,
	): Promise<JuiceMidiPlayer> {
		await ctx.audioWorklet.addModule(limiterWorkletUrl);
		const limiter = new AudioWorkletNode(ctx, 'juice-midi-limiter', {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			outputChannelCount: [2],
		});

		// JUICE: libfluidsynth本体を読み込む前に、既知の無害なログだけを間引くconsole.error/warnの
		// パッチをAudioWorkletGlobalScopeへ当てておく(juice-midi-quiet-fluidsynth-log.ts参照)
		await ctx.audioWorklet.addModule(quietFluidsynthLogWorkletUrl);

		await loadSynthesizerWorkletModules(ctx);
		const synth = new JSSynth.AudioWorkletNodeSynthesizer();
		// JUICE: 既定のsynth.polyphony(256)だと、和音密度が高い曲(いわゆるblack MIDI)や
		// シーク時の早送り処理(未発音区間の直前までのノート状態をまとめて再現する)で、FluidSynth
		// 内部のイベントキュー(ringbuffer)が溢れて "Ringbuffer full" 警告の大量発生・音切れ・
		// フリーズにつながるため、上限にかなり余裕を持たせておく
		const synthNode = synth.createAudioNode(ctx, { polyphony: maxPolyphony });

		const soundfont = await fetchSoundfont();
		await synth.loadSFont(soundfont);
		await synth.addSMFDataToPlayer(midiData);

		return new JuiceMidiPlayer(ctx, song, volume, limiter, synth, synthNode, onProgress, onEnded);
	}

	private constructor(
		private ctx: AudioContext,
		private song: JuiceMidiSong,
		volume: number,
		limiter: AudioWorkletNode,
		private synth: JSSynth.AudioWorkletNodeSynthesizer,
		synthNode: AudioWorkletNode,
		private onProgress: (currentTime: number, frame: JuiceMidiVisualizerFrame, playedNoteCount: number, bpm: number, activeNoteCount: number) => void,
		private onEnded: () => void,
	) {
		this.duration = song.durationSeconds;
		this.totalNoteCount = song.events.filter(event => event.type === 'noteOn').length;
		this.currentBpm = song.initialBpm;

		// JUICE: 和音の重なりで信号がかなり大きくなりうるため、ルックアヘッド付きピークリミッター
		// (juice-midi-limiter-processor.ts)を安全ネットとして挟んだうえで、さらに固定の減衰
		// (headroom)を1段噛ませる。共有のmediaVolume設定(this.master側)と混同しないよう
		// 別ノードにしている
		limiter.connect(ctx.destination);

		const headroom = ctx.createGain();
		headroom.gain.value = OUTPUT_HEADROOM_GAIN;
		headroom.connect(limiter);

		this.master = ctx.createGain();
		this.master.gain.value = Math.max(0, Math.min(1, volume));
		this.master.connect(headroom);

		synthNode.connect(this.master);
	}

	public async play(): Promise<void> {
		if (this.isPlaying || this.disposed) return;

		if (this.nextEventIndex === 0) {
			// 曲頭からの再生: 今の時計を「曲の0秒」の基準にする
			this.playbackStartContextTime = this.ctx.currentTime;
		}
		// 一時停止からの再開: suspend中はcurrentTimeが進まないため、基準点はそのままで良い

		await this.ctx.resume();
		if (!this.playerStarted) {
			this.playerStarted = true;
			await this.synth.playPlayer();
		}
		this.isPlaying = true;
		this.startScheduler();
	}

	// JUICE: ピアノロールをrequestAnimationFrameで滑らかに動かすための軽量な現在位置取得。
	// スケジューラ(TICK_INTERVAL_MS=50ms周期)のonProgressコールバックとは別に、呼び出し側が
	// 毎フレーム好きなタイミングで呼んで良い(ctx.currentTimeの読み出しだけなので軽い)
	public getCurrentTime(): number {
		if (this.disposed) return 0;
		return Math.min(this.ctx.currentTime - this.playbackStartContextTime, this.duration);
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
		this.synth.stopPlayer();
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

	// JUICE: シークバーからの移動。ビジュアライザー帳簿側の鍵盤ハイライトは、
	// どうせ直後にtick()が新しいノートの発音状況で上書きするため空のまま
	public seek(time: number): void {
		if (this.disposed) return;
		const clamped = Math.max(0, Math.min(time, this.duration));
		const now = this.ctx.currentTime;

		this.activeNotes.clear();
		this.pendingVisualizerEvents.length = 0;
		this.currentBpm = this.song.initialBpm;

		let index = 0;
		let playedNoteCount = 0;
		while (index < this.song.events.length && this.song.events[index].time < clamped) {
			const event = this.song.events[index];
			if (event.type === 'noteOn') {
				playedNoteCount++;
			} else if (event.type === 'tempo') {
				this.currentBpm = event.bpm;
			}
			index++;
		}
		this.nextEventIndex = index;
		this.playedNoteCount = playedNoteCount;
		this.playbackStartContextTime = now - clamped;

		this.synth.seekPlayer(this.secondsToTicks(clamped));

		this.onProgress(clamped, emptyVisualizerFrame(), this.playedNoteCount, this.currentBpm, this.activeNotes.size);

		if (this.isPlaying) {
			this.tick();
		}
	}

	// JUICE: シーク先(秒)に対応する絶対tickを、テンポマップ(tempoMap)を使って区間ごとに厳密に
	// 逆算する。総tick数に対する単純な比例配分(曲全体の平均テンポ換算)だと、テンポ変化のある
	// 曲でシーク位置がずれるため
	private secondsToTicks(time: number): number {
		const tempoMap = this.song.tempoMap;
		let checkpoint = tempoMap[0];
		for (const candidate of tempoMap) {
			if (candidate.time > time) break;
			checkpoint = candidate;
		}
		const deltaSeconds = time - checkpoint.time;
		const deltaTicks = deltaSeconds * this.song.ticksPerQuarter * 1_000_000 / checkpoint.microsPerQuarter;
		return Math.max(0, Math.round(checkpoint.tick + deltaTicks));
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
			this.pendingVisualizerEvents.push(this.song.events[this.nextEventIndex]);
			this.nextEventIndex++;
		}
		// JUICE: 消費(先読み)はscheduleUntilまで行うが、鍵盤ハイライト等への反映は実際に
		// nowSongTimeへ達した分だけにする(ピアノロールのノートが鍵盤に当たる瞬間と一致させるため)
		let appliedCount = 0;
		while (appliedCount < this.pendingVisualizerEvents.length && this.pendingVisualizerEvents[appliedCount].time <= nowSongTime) {
			this.applyVisualizerEvent(this.pendingVisualizerEvents[appliedCount]);
			appliedCount++;
		}
		if (appliedCount > 0) this.pendingVisualizerEvents.splice(0, appliedCount);

		this.onProgress(Math.min(nowSongTime, this.duration), this.currentVisualizerFrame(), this.playedNoteCount, this.currentBpm, this.activeNotes.size);

		if (nowSongTime >= this.duration) {
			this.stopScheduler();
			this.isPlaying = false;
			this.synth.stopPlayer();
			this.synth.seekPlayer(0);
			this.playerStarted = false;
			this.activeNotes.clear();
			this.pendingVisualizerEvents.length = 0;
			// JUICE: currentTimeと同様、終了直後は最終値(全ノート再生済み)を1回通知してから
			// 次回の曲頭再生に備えてリセットする
			this.onProgress(this.duration, emptyVisualizerFrame(), this.playedNoteCount, this.currentBpm, this.activeNotes.size);
			this.nextEventIndex = 0;
			this.playedNoteCount = 0;
			this.currentBpm = this.song.initialBpm;
			this.onEnded();
		}
	}

	// JUICE: ビジュアライザー用。pendingVisualizerEventsを介すため、実際の発音タイミングと
	// ずれない。同じノート番号を複数トラックが同時に鳴らしている場合は、一番強い(peakが高い)
	// トラックの色で代表させる
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

	// JUICE: 実際の発音(FluidSynth)には一切関与せず、ビジュアライザー帳簿だけを進める。
	// サステインペダル(CC64)は無視する: 鍵盤ハイライトはnoteOffで即座に消す(実際の音は
	// FluidSynth側でペダルの仕様通り延びるが、それとは独立した「鍵盤が押されているか」の表示)
	private applyVisualizerEvent(event: JuiceMidiEvent): void {
		if (event.type === 'tempo') {
			this.currentBpm = event.bpm;
			return;
		}

		if (event.type !== 'noteOn' && event.type !== 'noteOff') return;

		const key = `${event.channel}:${event.note}`;

		if (event.type === 'noteOff') {
			this.activeNotes.delete(key);
			return;
		}

		// noteOn: 同じ音が既に鳴っていたら(壊れたファイル等)一旦上書きする
		this.playedNoteCount++;

		const velocity = Math.max(0, Math.min(1, event.velocity / 127));
		this.activeNotes.set(key, { note: event.note, track: event.track, channel: event.channel, peak: velocity });
	}
}
