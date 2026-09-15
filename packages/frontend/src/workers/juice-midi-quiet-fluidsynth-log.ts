/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: MIDIプレイヤー(juice-midi-player.ts)が使うFluidSynth(WebAssembly)は、AudioWorklet側の
// グローバルスコープでconsole.error/warnへ直接ログを出す。"fluid_file_test/fluid_stat is a stub"
// (Emscripten仮想FS上の無害なスタブ通知。ソースがブラウザ上に無いため常に出る)や、和音密度が
// 高い曲(いわゆるblack MIDI)・シーク時の早送り処理での大量の"Ringbuffer full"警告(実際の再生
// 停止を伴わない単なる通知)は、devtoolsを開いた状態で大量に出力されると、それ自体が
// メインスレッドを詰まらせフリーズしたように見える原因になる。
//
// js-synthesizerパッケージ本体のdisableLogging()はメインスレッド側で別途読み込むWASMインスタンス
// (Synthesizerクラス用)を要求し、このプレイヤーはAudioWorklet側のインスタンスしか使わないため
// 呼べない("wasm module is not available"で失敗する)。かわりにこのファイルを、libfluidsynth本体
// (js-synthesizer.worklet)より先に同じAudioContextへ登録し、同じAudioWorkletGlobalScope上の
// console.error/warnを、既知の無害なパターンだけ間引く

const NOISY_PATTERNS = [
	/is a stub, always returning/, // fluid_file_test / fluid_stat
	/Ringbuffer full, try increasing synth\.polyphony/,
];

function isNoisyFluidsynthLog(args: unknown[]): boolean {
	const first = args[0];
	return typeof first === 'string' && NOISY_PATTERNS.some(pattern => pattern.test(first));
}

for (const method of ['error', 'warn'] as const) {
	// eslint-disable-next-line no-console
	const original = console[method].bind(console);
	console[method] = (...args: unknown[]) => {
		if (isNoisyFluidsynthLog(args)) return;
		original(...args);
	};
}

export {}; // このファイルをモジュールとして扱わせる
