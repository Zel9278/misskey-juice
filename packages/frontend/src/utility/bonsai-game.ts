/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, computed } from 'vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { claimAchievement } from '@/utility/achievements.js';

// JUICE: Misskey Gamesに追加した「盆栽を育てるゲーム」のセーブデータ管理。
// clicker-game.tsと同じくi/registryをスコープ付きキーバリューストアとして使い、
// 独自のバックエンド実装(migration等)を追加せずアカウント単位で同期する。

export const STAGE_COUNT = 5;
// 表示名はi18n化のためbonsai.vue側でi18n.ts._bonsai._stagesから解決する
export const STAGE_EMOJI = ['🌰', '🌱', '🌿', '🪴', '🌳'];

const WATER_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20時間(実質1日1回、多少の前後を許容)
export const WATERINGS_PER_STAGE = 5;
const NEGLECT_GRACE_MS = 4 * 24 * 60 * 60 * 1000; // 最後の水やりから4日は枯れない
const HEALTH_DECAY_PER_DAY = 25; // 猶予後、1日あたりの体力減少

type SaveData = {
	gameVersion: number;
	stage: number;
	waterCount: number;
	health: number;
	lastWateredAt: number | null;
	witherCount: number;
};

export const saveData = ref<SaveData>();
export const ready = computed(() => saveData.value != null);

function initialSaveData(): SaveData {
	return {
		gameVersion: 1,
		stage: 0,
		waterCount: 0,
		health: 100,
		lastWateredAt: null,
		witherCount: 0,
	};
}

// 最後に開いてからの経過時間で、体力減少・枯れ判定をまとめて適用する(オフライン中の経過を反映)
function applyNeglect(data: SaveData): SaveData {
	if (data.lastWateredAt == null) return data;

	const elapsed = Date.now() - data.lastWateredAt;
	if (elapsed <= NEGLECT_GRACE_MS) return data;

	const oneDayMs = 24 * 60 * 60 * 1000;
	const overdueDays = Math.floor((elapsed - NEGLECT_GRACE_MS) / oneDayMs);
	if (overdueDays <= 0) return data;

	// JUICE: 処理済みの超過日数分だけ基準点を繰り上げておかないと、次にこの関数を呼んだ時に
	// 同じ超過日数を再計算し続けてしまい、実際の経過時間に関わらず開くたびに毎回退行するバグになる
	data.lastWateredAt += overdueDays * oneDayMs;

	let health = data.health - (overdueDays * HEALTH_DECAY_PER_DAY);

	if (health <= 0 && data.stage > 0) {
		data.stage -= 1;
		data.waterCount = 0;
		data.witherCount += 1;
		health = 50;
		claimAchievement('bonsaiWithered');
	}

	data.health = Math.max(0, Math.min(100, health));
	return data;
}

let prev = '';

export async function load() {
	try {
		const loaded = await misskeyApi<SaveData>('i/registry/get', {
			scope: ['bonsaiGame'],
			key: 'saveData',
		});
		const before = JSON.stringify(loaded);
		saveData.value = applyNeglect(loaded);
		// JUICE: clicker-game.tsのload()に合わせ、ネグレクトで実際に状態が変わった時だけ書き戻す
		if (JSON.stringify(saveData.value) !== before) save();
	} catch (err: any) {
		if (err.code === 'NO_SUCH_KEY') {
			saveData.value = initialSaveData();
			save();
			return;
		}
		throw err;
	}
}

export async function save() {
	const current = JSON.stringify(saveData.value);
	if (current === prev) return;

	await misskeyApi('i/registry/set', {
		scope: ['bonsaiGame'],
		key: 'saveData',
		value: saveData.value,
	});

	prev = current;
}

export function canWaterNow(data: SaveData): boolean {
	if (data.lastWateredAt == null) return true;
	return (Date.now() - data.lastWateredAt) >= WATER_COOLDOWN_MS;
}

export function msUntilNextWatering(data: SaveData): number {
	if (data.lastWateredAt == null) return 0;
	return Math.max(0, WATER_COOLDOWN_MS - (Date.now() - data.lastWateredAt));
}

export function water() {
	const data = saveData.value;
	if (data == null) return;
	if (!canWaterNow(data)) return;

	if (data.lastWateredAt == null) {
		claimAchievement('bonsaiFirstWater');
	}

	data.lastWateredAt = Date.now();
	data.health = Math.min(100, data.health + 10);

	if (data.stage < STAGE_COUNT - 1) {
		data.waterCount += 1;
		if (data.waterCount >= WATERINGS_PER_STAGE) {
			data.waterCount = 0;
			data.stage += 1;
			if (data.stage === STAGE_COUNT - 1) {
				claimAchievement('bonsaiFullyGrown');
			}
		}
	}

	save();
}
