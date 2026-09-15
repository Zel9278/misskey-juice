/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: MIDIプレイヤー(juice-midi-player.ts)のサウンドフォント(実サンプル音源)まわりの
// 準備をまとめたユーティリティ。音源データ(GeneralUser GS、about-juiceページにライセンス記載)は
// 静的アセット(/client-assets/)としてバンドルしており、外部サイトへは一切問い合わせない。
// js-synthesizer(BSD-3-Clause、FluidSynthをWebAssemblyへコンパイルしたもの)のAudioWorklet側
// 処理コード(libfluidsynth本体・synthesizer本体)は、曲を実際に再生する時だけ読み込む
// (黒MIDI対策の再生上限と同じ考え方で、MIDIを再生しないユーザーには負荷をかけない)。

import libfluidsynthWorkletUrl from 'js-synthesizer/externals/libfluidsynth-2.4.6.js?url';
import synthesizerWorkletUrl from 'js-synthesizer/dist/js-synthesizer.worklet.min.js?url';

// JUICE: このリポジトリに同梱しているサウンドフォント本体(packages/frontend/assets/)。
// ライセンス(GeneralUser GS License v2.0、私的/商用利用・改変・再配布いずれも許諾)は
// about-juiceページに記載している
const SOUNDFONT_URL = '/client-assets/GeneralUser-GS.sf2';

let cachedSoundfont: Promise<ArrayBuffer> | null = null;

// JUICE: 30MB超のファイルなので、同一ページ内で複数のMIDIプレイヤーが開かれても
// 一度のfetchだけで済むようモジュール単位でキャッシュする(2回目以降はブラウザの
// HTTPキャッシュにも乗るが、ArrayBufferへのデコードまで含めて省略できるようにする)
export function fetchSoundfont(): Promise<ArrayBuffer> {
	cachedSoundfont ??= window.fetch(SOUNDFONT_URL).then(res => {
		if (!res.ok) throw new Error(`Failed to fetch soundfont: ${res.status}`);
		return res.arrayBuffer();
	});
	return cachedSoundfont;
}

// JUICE: AudioWorkletのモジュール登録はAudioContextインスタンスごとに独立している
// (MIDIプレイヤー1個につきAudioContextを1個生成するため、実質「プレイヤーごとに1回」になる)。
// 同じAudioContextに対して誤って複数回addModule()しないよう、Context単位でキャッシュする
const workletModulesByContext = new WeakMap<AudioContext, Promise<void>>();

// JUICE: AudioWorklet側の実行コード(libfluidsynth本体→synthesizer本体の順で登録する必要がある)
export function loadSynthesizerWorkletModules(ctx: AudioContext): Promise<void> {
	let promise = workletModulesByContext.get(ctx);
	if (promise == null) {
		promise = ctx.audioWorklet.addModule(libfluidsynthWorkletUrl)
			.then(() => ctx.audioWorklet.addModule(synthesizerWorkletUrl));
		workletModulesByContext.set(ctx, promise);
	}
	return promise;
}
