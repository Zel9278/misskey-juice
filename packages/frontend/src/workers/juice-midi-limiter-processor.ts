/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: MIDIプレイヤー(juice-midi-player.ts)の出力段に挿む、ルックアヘッド付きの
// ピークリミッター。DynamicsCompressorNodeのようなソフトニー圧縮ではなく、しきい値を
// 超えた分を確実に(アタックは瞬時、リリースは指数関数的に)抑え込む実装で、
// foo_kazulimitter(Kazu Limiter、REAPER JSFX用ピークリミッター)のアルゴリズムを移植した。
// AudioWorkletGlobalScopeで動くため、メインスレッド側のコードとは何も共有しない
// (importも行わない)自己完結ファイルにしてある。

export {}; // このファイルをモジュールとして扱わせ、以下のdeclareをファイル内に閉じ込める

declare const sampleRate: number;

declare class AudioWorkletProcessor {
	readonly port: MessagePort;
	constructor(options?: AudioWorkletNodeOptions);
	process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(
	name: string,
	processorCtor: (new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor) & { parameterDescriptors?: unknown[] },
): void;

const THRESHOLD_DB = -1; // このdBFSを超えないようゲインを絞る(超えないための余白は呼び出し元のheadroom gainと合わせて確保する)
const RELEASE_MS = 50; // ゲインをしきい値超え前まで戻す速さ
const PEAK_DECAY_MS = 5; // ピーク検出の減衰(参照実装の"lookahead"パラメータに相当。実際の信号遅延は発生しない)

class JuiceMidiLimiterProcessor extends AudioWorkletProcessor {
	private readonly threshold = Math.pow(10, THRESHOLD_DB / 20);
	private readonly releaseCoef: number;
	private readonly peakDecayCoef: number;
	private peakEnvelope: number[] = [];
	private smoothedGain: number[] = [];

	constructor(options?: AudioWorkletNodeOptions) {
		super(options);
		this.releaseCoef = Math.exp(-1 / ((RELEASE_MS / 1000) * sampleRate));
		this.peakDecayCoef = Math.exp(-1 / ((PEAK_DECAY_MS / 1000) * sampleRate));
	}

	process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
		const input = inputs[0];
		const output = outputs[0];
		if (input == null || output == null || input.length === 0) return true;

		const channelCount = input.length;
		const frameCount = input[0].length;

		while (this.peakEnvelope.length < channelCount) {
			this.peakEnvelope.push(0);
			this.smoothedGain.push(1);
		}

		for (let i = 0; i < frameCount; i++) {
			// JUICE: L/Rどちらか片方だけを絞るとステレオイメージが揺れるため、
			// 全チャンネルの中で最も小さいゲイン(=最も強く絞る必要があるゲイン)を全チャンネルへ適用する
			let linkedGain = 1;
			for (let ch = 0; ch < channelCount; ch++) {
				const sample = input[ch][i];
				const absSample = Math.abs(sample);

				this.peakEnvelope[ch] *= this.peakDecayCoef;
				if (absSample > this.peakEnvelope[ch]) this.peakEnvelope[ch] = absSample;

				const instantGain = this.peakEnvelope[ch] <= this.threshold ? 1 : this.threshold / this.peakEnvelope[ch];
				if (instantGain < this.smoothedGain[ch]) {
					this.smoothedGain[ch] = instantGain; // アタック: 即座に反映(音割れを確実に防ぐ)
				} else {
					this.smoothedGain[ch] = this.releaseCoef * this.smoothedGain[ch] + (1 - this.releaseCoef) * instantGain; // リリース: 滑らかに戻す
				}

				if (this.smoothedGain[ch] < linkedGain) linkedGain = this.smoothedGain[ch];
			}

			for (let ch = 0; ch < channelCount; ch++) {
				output[ch][i] = input[ch][i] * linkedGain;
			}
		}

		return true;
	}
}

registerProcessor('juice-midi-limiter', JuiceMidiLimiterProcessor);
