/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { prefer } from '@/preferences.js';

// JUICE: リレーを削除して再登録すると、同じホストでも新しいリレーIDが発行される
// (RelayService.addRelayは常に新規ID)。そのため、既に存在しないリレーIDが
// prefer.s.relayTimelineFilterに永久に残り続け、そのIDだけに絞り込んでいたユーザーの
// リレータイムラインが「なぜか空のまま」になり、UI上に古いIDを外す手段も無い。
// 生きているリレー一覧を取得するたびに、もう存在しないIDを自動で取り除く
export function pruneRelayTimelineFilter(liveRelayIds: readonly string[]): void {
	const current = prefer.s.relayTimelineFilter;
	if (current.length === 0) return;

	const pruned = current.filter(id => liveRelayIds.includes(id));
	if (pruned.length !== current.length) {
		prefer.commit('relayTimelineFilter', pruned);
	}
}
