<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<MkInfo v-if="!enabled">{{ i18n.ts._avatarDecorationRequestPage.disabled }}</MkInfo>
		<template v-else>
			<div v-if="tab === 'form'" class="_gaps_m">
				<MkButton rounded style="margin: 0 auto;" :disabled="maxAddable <= 0" @click="chooseFile">{{ i18n.ts.selectFile }}</MkButton>
				<!-- JUICE: 審査待ちの残り件数・1日あたりの残り送信回数・今回選択中の件数を、1枚のカードに
				まとめて表示する(件数が増えるとインフォカードが積み重なって画面を圧迫するため、
				送信前に把握しておきたい状態はここに集約する) -->
				<MkInfo :warn="limitsWarning">
					{{ remaining <= 0 ? i18n.tsx._avatarDecorationRequestPage.limitReached({ limit: requestLimit }) : i18n.tsx._avatarDecorationRequestPage.remainingCount({ pending: pendingCount, limit: requestLimit, remaining }) }}<br/>
					<template v-if="dailyRemaining != null">
						{{ dailyRemaining === 0 ? i18n.ts._avatarDecorationRequestPage.dailyLimitReached : i18n.tsx._avatarDecorationRequestPage.dailyRemainingCount({ remaining: dailyRemaining }) }}
						<!-- JUICE: 1日あたりの送信回数は日付ではなく直近24時間のスライディングウィンドウで
						カウントしているため、ユーザーが実際に次に送信できるようになる時刻(ETA)を
						MkTimeの相対表示で案内する(実績が無ければdailyResetAtはnullなので表示しない) -->
						<template v-if="dailyResetAt != null">({{ i18n.ts._avatarDecorationRequestPage.dailyResetLabel }}: <MkTime :time="dailyResetAt" mode="relative"/>)</template><br/>
					</template>
					{{ i18n.tsx._avatarDecorationRequestPage.selectedCount({ selected: drafts.length, cap: batchCap }) }}
				</MkInfo>
				<!-- JUICE: 複数の画像をまとめて選択すると、同じ画面から複数件をまとめて申請できる(まだ
				何も選んでいない最初のうちだけ案内し、選択が始まったら消えて画面をすっきりさせる) -->
				<MkInfo v-if="drafts.length === 0">
					{{ i18n.ts._avatarDecorationRequestPage.multipleRequestsHint }}<br/>
					{{ i18n.tsx._avatarDecorationRequestPage.maxItemsPerSubmission({ max: MAX_BATCH_ITEMS }) }}
				</MkInfo>

				<div v-for="(draft, i) in drafts" :key="draft.key" class="_gaps_s" :class="$style.draftCard">
					<!-- JUICE: 複数件申請時の番号表示は不要でも、選び直したい場合の削除ボタンは
					1件だけの場合でも必要なため、ヘッダー自体はdrafts.length>1で出し分けない -->
					<div :class="$style.draftHeader">
						<span v-if="drafts.length > 1">{{ i18n.tsx._avatarDecorationRequestPage.requestNumber({ n: i + 1 }) }}</span>
						<button class="_button" :class="$style.draftRemoveButton" @click="removeDraft(draft.key)">
							<i class="ti ti-x"></i>
						</button>
					</div>

					<div :class="$style.preview">
						<div :class="$style.previewLabel">{{ i18n.ts._avatarDecorationRequestPage.preview }}</div>
						<div :class="$style.previewSwatches">
							<div :class="[$style.previewSwatch, $style.light]">
								<MkAvatar :class="$style.previewAvatar" :user="$i" :decorations="[decorationForPreview(draft)]" forceShowDecoration/>
							</div>
							<div :class="[$style.previewSwatch, $style.dark]">
								<MkAvatar :class="$style.previewAvatar" :user="$i" :decorations="[decorationForPreview(draft)]" forceShowDecoration/>
							</div>
						</div>
						<!-- JUICE: 装着ダイアログ(settings/avatar-decoration.dialog.vue)と同じ角度・位置・反転の調整UI -->
						<div class="_gaps_s" :class="$style.previewControls">
							<MkRange v-model="draft.previewAngle" continuousUpdate :min="-0.5" :max="0.5" :step="0.025" :textConverter="(v) => `${Math.floor(v * 360)}°`">
								<template #label>{{ i18n.ts.angle }}</template>
							</MkRange>
							<MkRange v-model="draft.previewOffsetX" continuousUpdate :min="-0.25" :max="0.25" :step="0.025" :textConverter="(v) => `${Math.floor(v * 100)}%`">
								<template #label>X {{ i18n.ts.position }}</template>
							</MkRange>
							<MkRange v-model="draft.previewOffsetY" continuousUpdate :min="-0.25" :max="0.25" :step="0.025" :textConverter="(v) => `${Math.floor(v * 100)}%`">
								<template #label>Y {{ i18n.ts.position }}</template>
							</MkRange>
							<MkSwitch v-model="draft.previewFlipH">
								<template #label>{{ i18n.ts.flip }}</template>
							</MkSwitch>
						</div>
						<MkInfo>{{ i18n.ts._avatarDecorationRequestPage.previewAdjustHint }}</MkInfo>
					</div>

					<!-- JUICE: 差し替え申請(既存のデコレーションの画像だけを差し替える) -->
					<div class="_gaps_s">
						<MkSwitch :modelValue="draft.targetAvatarDecorationId != null" @update:modelValue="(v) => onToggleReplacement(draft, v)">
							<template #label>{{ i18n.ts._avatarDecorationRequestPage.replacementRequest }}</template>
							<template #caption>{{ i18n.ts._avatarDecorationRequestPage.replacementRequestCaption }}</template>
						</MkSwitch>
						<MkInfo v-if="draft.targetAvatarDecorationId != null">
							{{ i18n.ts._avatarDecorationRequestPage.replacementTarget }}: <b>{{ draft.name }}</b>
							<button class="_textButton" @click="pickReplacementTarget(draft)">{{ i18n.ts._avatarDecorationRequestPage.changeTarget }}</button>
						</MkInfo>
					</div>

					<MkInput v-model="draft.name" :readonly="draft.targetAvatarDecorationId != null">
						<template #label>{{ i18n.ts.name }}</template>
					</MkInput>

					<template v-if="draft.targetAvatarDecorationId == null">
						<MkTextarea v-model="draft.description">
							<template #label>{{ i18n.ts._avatarDecorationRequestPage.description }}</template>
						</MkTextarea>

						<MkInput v-model="draft.category">
							<template #label>{{ i18n.ts._avatarDecorationRequestPage.category }}</template>
						</MkInput>
					</template>
					<MkSwitch v-model="draft.deleteFileAfterReview">
						<template #label>{{ i18n.ts._avatarDecorationRequestPage.deleteFileAfterReview }}</template>
					</MkSwitch>
				</div>

				<MkCaptcha v-if="instance.enableHcaptcha" ref="hcaptcha" v-model="hCaptchaResponse" provider="hcaptcha" :sitekey="instance.hcaptchaSiteKey"/>
				<MkCaptcha v-if="instance.enableMcaptcha" ref="mcaptcha" v-model="mCaptchaResponse" provider="mcaptcha" :sitekey="instance.mcaptchaSiteKey" :instanceUrl="instance.mcaptchaInstanceUrl"/>
				<MkCaptcha v-if="instance.enableRecaptcha" ref="recaptcha" v-model="reCaptchaResponse" provider="recaptcha" :sitekey="instance.recaptchaSiteKey"/>
				<MkCaptcha v-if="instance.enableTurnstile" ref="turnstile" v-model="turnstileResponse" provider="turnstile" :sitekey="instance.turnstileSiteKey"/>
				<MkCaptcha v-if="instance.enableTestcaptcha" ref="testcaptcha" v-model="testcaptchaResponse" provider="testcaptcha" :sitekey="null"/>

				<MkButton primary rounded :disabled="shouldDisableSubmitting" @click="submit"><i class="ti ti-check"></i> {{ i18n.ts._avatarDecorationRequestPage.submit }}</MkButton>
			</div>
			<div v-else-if="tab === 'pending'" class="_gaps">
				<MkInfo v-if="pendingPaginator.items.value.length === 0 && !pendingPaginator.fetching.value">{{ i18n.ts._avatarDecorationRequestPage.noPendingRequests }}</MkInfo>
				<MkPagination v-slot="{items}" :paginator="pendingPaginator">
					<div class="_gaps">
						<MkAvatarDecorationRequestItem v-for="request in items" :key="request.id" :request="request" cancelable @cancelled="onCancelled"/>
					</div>
				</MkPagination>
			</div>
			<div v-else-if="tab === 'result'" class="_gaps">
				<MkSelect v-model="resultStatus" style="margin: 0;" :items="resultStatusDef">
					<template #label>{{ i18n.ts.state }}</template>
				</MkSelect>
				<MkInfo v-if="resultPaginator.items.value.length === 0 && !resultPaginator.fetching.value">{{ i18n.ts._avatarDecorationRequestPage.noRequests }}</MkInfo>
				<MkPagination v-slot="{items}" :paginator="resultPaginator">
					<div class="_gaps">
						<MkAvatarDecorationRequestItem v-for="request in items" :key="request.id" :request="request"/>
					</div>
				</MkPagination>
			</div>
		</template>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, onUnmounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import type { Captcha } from '@/components/MkCaptcha.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkRange from '@/components/MkRange.vue';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkAvatarDecorationRequestItem from '@/components/MkAvatarDecorationRequestItem.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkCaptcha from '@/components/MkCaptcha.vue';
import * as os from '@/os.js';
import { selectFileDeferred, uploadFile } from '@/utility/drive.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { Paginator } from '@/utility/paginator.js';
import { ensureSignin } from '@/i.js';
import { instance } from '@/instance.js';
import { genId } from '@/utility/id.js';

const $i = ensureSignin();

const enabled = ref(true);
misskeyApi('juice/public-settings').then(res => {
	enabled.value = res.avatarDecorationRequestEnabled;
});

// JUICE: 「あと何件申請できるか」「1回でまとめて申請できる上限」を送信前に表示するための状態。
// 上限自体はロールポリシー(i.policies.avatarDecorationRequestLimit)から、現在の審査待ち件数は
// 専用のavatar-decoration-requests/countから取得する。MAX_BATCH_ITEMSは
// avatar-decoration-requests/create-manyのparamDefのmaxItemsと合わせている
const pendingCount = ref(0);
// JUICE: 審査待ち件数の上限(avatarDecorationRequestLimit)とは別に、
// avatar-decoration-requests/create-manyの1日あたりの送信回数上限
// (avatarDecorationRequestDailyLimit、API呼び出し頻度)の残り回数。
// nullは開発環境等レートリミットが無効な場合を表し、この場合は表示しない
const dailyRemaining = ref<number | null>(null);
// JUICE: 1日あたりの送信回数上限が次に回復する日時(ETA)。今回の集計期間に送信実績が
// 無い場合はnull(表示しない)
const dailyResetAt = ref<string | null>(null);
misskeyApi('avatar-decoration-requests/count').then(res => {
	pendingCount.value = res.pending;
	dailyRemaining.value = res.dailyRemaining;
	dailyResetAt.value = res.dailyResetAt;
});
const requestLimit = computed(() => $i.policies.avatarDecorationRequestLimit);
const remaining = computed(() => Math.max(0, requestLimit.value - pendingCount.value));
// JUICE: 審査待ち件数・1日あたりの送信回数のどちらかが上限に達している場合、まとめた
// インフォカード全体をwarn表示にする
const limitsWarning = computed(() => remaining.value <= 0 || dailyRemaining.value === 0);
const MAX_BATCH_ITEMS = 10;

const tab = ref('form');

// JUICE: 複数の画像をまとめて選択すると、同じ画面から複数件をまとめて申請できる。
// 1件だけ選んだ場合も内部的には要素数1のdraftsとして扱う(見た目は従来通り単一フォーム)
type AvatarDecorationRequestDraft = {
	key: string;
	// JUICE: 「PCからアップロード」の場合はこの時点ではまだDriveにアップロードしておらず、
	// 生のFileのまま保持する(申請の送信時にuploadFile()する)。「ドライブから選択」
	// 「URLから」は従来通り、選択した時点で既にアップロード済みのDriveFile
	file: File | Misskey.entities.DriveFile;
	// JUICE: プレビュー表示用のURL。fileが生のFileの場合はURL.createObjectURLで作った
	// ローカルURLなので、ドラフトを破棄する際は必ずrevokeDraftPreview()で解放すること
	previewUrl: string;
	name: string;
	description: string;
	category: string;
	deleteFileAfterReview: boolean;
	// JUICE: プレビュー確認用の角度・位置・反転。装着ダイアログ(avatar-decoration.dialog.vue)と
	// 同じUI・値域だが、これは申請データには含めない(実際の角度・位置は装着する各ユーザーが個別に
	// 設定するものであり、デコレーション自体に固定の値は存在しないため)
	previewAngle: number;
	previewOffsetX: number;
	previewOffsetY: number;
	previewFlipH: boolean;
	// JUICE: 差し替え申請(既存のデコレーションの画像だけを差し替える)の対象。nullなら通常の新規申請
	targetAvatarDecorationId: string | null;
};

const drafts = ref<AvatarDecorationRequestDraft[]>([]);

// JUICE: 今回のバッチで選択できる上限(審査待ちの残り枠と1回の申請上限のうち小さい方)
const batchCap = computed(() => Math.min(remaining.value, MAX_BATCH_ITEMS));
// JUICE: 現在のドラフト数を踏まえて、これ以上あと何件ドラフトを追加できるか
const maxAddable = computed(() => Math.max(0, batchCap.value - drafts.value.length));

// JUICE: 差し替え申請の対象選択用。自分の承認済み申請(デコレーションが実際に作られたもの)のみを
// 候補にする。初回に選択を試みたタイミングで一度だけ取得する
let myApprovedAvatarDecorationRequests: Misskey.entities.AvatarDecorationRequestEntry[] | null = null;

async function fetchMyApprovedAvatarDecorationRequests(): Promise<Misskey.entities.AvatarDecorationRequestEntry[]> {
	if (myApprovedAvatarDecorationRequests == null) {
		const fetched = await misskeyApi('avatar-decoration-requests/list', { status: 'approved', limit: 100 });
		myApprovedAvatarDecorationRequests = fetched;
		return fetched;
	}
	return myApprovedAvatarDecorationRequests;
}

async function pickReplacementTarget(draft: AvatarDecorationRequestDraft) {
	const requests = await fetchMyApprovedAvatarDecorationRequests();
	const eligible = requests.filter(r => r.resultAvatarDecorationId != null);
	if (eligible.length === 0) {
		os.alert({ type: 'info', text: i18n.ts._avatarDecorationRequestPage.noReplaceableAvatarDecorations });
		draft.targetAvatarDecorationId = null;
		return;
	}

	const { canceled, result } = await os.select({
		title: i18n.ts._avatarDecorationRequestPage.selectTargetAvatarDecoration,
		items: eligible.map(r => ({ value: r.resultAvatarDecorationId!, label: r.name })),
	});
	if (canceled || result == null) {
		if (draft.targetAvatarDecorationId == null) return;
	} else {
		draft.targetAvatarDecorationId = result;
		draft.name = eligible.find(r => r.resultAvatarDecorationId === result)?.name ?? draft.name;
	}
}

function onToggleReplacement(draft: AvatarDecorationRequestDraft, enabled: boolean) {
	if (enabled) {
		pickReplacementTarget(draft);
	} else {
		draft.targetAvatarDecorationId = null;
	}
}

// JUICE
function decorationForPreview(draft: AvatarDecorationRequestDraft) {
	return {
		url: draft.previewUrl,
		angle: draft.previewAngle,
		flipH: draft.previewFlipH,
		offsetX: draft.previewOffsetX,
		offsetY: draft.previewOffsetY,
	};
}

// JUICE: PCから選択した生のFileのプレビュー用に作ったURL.createObjectURLは、
// 使い終わったら必ず解放する(ドライブ/URL経由のDriveFileのurlはそのままなので対象外)
function revokeDraftPreview(draft: AvatarDecorationRequestDraft) {
	if (!(draft.file instanceof File)) return;
	URL.revokeObjectURL(draft.previewUrl);
}

// JUICE
const hcaptcha = ref<Captcha | undefined>();
const mcaptcha = ref<Captcha | undefined>();
const recaptcha = ref<Captcha | undefined>();
const turnstile = ref<Captcha | undefined>();
const testcaptcha = ref<Captcha | undefined>();
const hCaptchaResponse = ref<string | null>(null);
const mCaptchaResponse = ref<string | null>(null);
const reCaptchaResponse = ref<string | null>(null);
const turnstileResponse = ref<string | null>(null);
const testcaptchaResponse = ref<string | null>(null);

const shouldDisableSubmitting = computed((): boolean => {
	return drafts.value.length === 0 || drafts.value.some(d => !d.name) ||
		drafts.value.length > remaining.value ||
		instance.enableHcaptcha && !hCaptchaResponse.value ||
		instance.enableMcaptcha && !mCaptchaResponse.value ||
		instance.enableRecaptcha && !reCaptchaResponse.value ||
		instance.enableTurnstile && !turnstileResponse.value ||
		instance.enableTestcaptcha && !testcaptchaResponse.value;
});

// JUICE: 「自分の申請」を審査待ち/結果の2タブに分割し、それぞれ別のPaginatorで絞り込んで取得する
const pendingPaginator = markRaw(new Paginator('avatar-decoration-requests/list', {
	limit: 10,
	params: { status: 'pending' },
}));

const resultStatus = ref<'approved' | 'rejected' | 'cancelled'>('approved');
const resultStatusDef = [
	{ value: 'approved', label: i18n.ts._avatarDecorationRequestPage.statusApproved },
	{ value: 'rejected', label: i18n.ts._avatarDecorationRequestPage.statusRejected },
	{ value: 'cancelled', label: i18n.ts._avatarDecorationRequestPage.statusCancelled },
];
const resultPaginator = markRaw(new Paginator('avatar-decoration-requests/list', {
	limit: 10,
	computedParams: computed(() => ({ status: resultStatus.value })),
}));

// JUICE: 審査待ちの申請を申請者自身がキャンセルした場合、審査待ち一覧から即座に取り除き、
// 残り申請可能数の表示にも反映する
function onCancelled(requestId: string) {
	pendingPaginator.removeItem(requestId);
	pendingCount.value = Math.max(0, pendingCount.value - 1);
}

function chooseFile(ev: PointerEvent) {
	selectFileDeferred({
		anchorElement: ev.currentTarget ?? ev.target,
		multiple: true,
	}).then(files => {
		// JUICE: 審査待ち上限・1回の申請上限を超える分は追加しない。黙って切り捨てると
		// 気づけないため、切り捨てが発生した場合はトーストで知らせる
		const accepted = files.slice(0, maxAddable.value);
		if (files.length > accepted.length) {
			os.toast(i18n.tsx._avatarDecorationRequestPage.tooManyFilesSelected({ skipped: files.length - accepted.length }));
		}
		for (const f of accepted) {
			drafts.value.push({
				key: genId(),
				file: f,
				previewUrl: f instanceof File ? URL.createObjectURL(f) : f.url,
				name: f.name.replace(/\.(.+)$/, ''),
				description: '',
				category: '',
				deleteFileAfterReview: false,
				previewAngle: 0,
				previewOffsetX: 0,
				previewOffsetY: 0,
				previewFlipH: false,
				targetAvatarDecorationId: null,
			});
		}
	});
}

function removeDraft(key: string) {
	const draft = drafts.value.find(d => d.key === key);
	if (draft) revokeDraftPreview(draft);
	drafts.value = drafts.value.filter(d => d.key !== key);
}

// JUICE: 「PCからアップロード」を選んだドラフトはこの時点まだDriveに上がっていないため、
// 申請の送信直前にここでアップロードしてfileIdを確定する
async function resolveFileId(file: File | Misskey.entities.DriveFile): Promise<string> {
	if (file instanceof File) {
		const { filePromise } = uploadFile(file, { name: file.name });
		const driveFile = await filePromise;
		return driveFile.id;
	}
	return file.id;
}

async function submit() {
	if (drafts.value.length === 0 || drafts.value.some(d => !d.name)) return;

	const done = os.waiting();
	let fileIds: string[];
	try {
		fileIds = await Promise.all(drafts.value.map(d => resolveFileId(d.file)));
	} catch {
		done();
		return;
	}
	done({ success: true });

	os.apiWithDialog('avatar-decoration-requests/create-many', {
		requests: drafts.value.map((d, i) => ({
			fileId: fileIds[i],
			name: d.name,
			description: d.description,
			category: d.category || null,
			deleteFileAfterReview: d.deleteFileAfterReview,
			targetAvatarDecorationId: d.targetAvatarDecorationId,
		})),
		'hcaptcha-response': hCaptchaResponse.value,
		'm-captcha-response': mCaptchaResponse.value,
		'g-recaptcha-response': reCaptchaResponse.value,
		'turnstile-response': turnstileResponse.value,
		'testcaptcha-response': testcaptchaResponse.value,
	}, undefined, {
		// JUICE: RATE_LIMIT_EXCEEDEDはApiCallServiceが全エンドポイント共通で使う固定id(何に対する
		// 制限かがメッセージに出ない)のため、このエンドポイント固有の文言に差し替える
		'd5826d14-3982-4d2e-8011-b9e9f02499ef': {
			title: i18n.ts._avatarDecorationRequestPage.dailyLimitExceededTitle,
			text: i18n.ts._avatarDecorationRequestPage.dailyLimitExceededDescription,
		},
	}).then(requests => {
		for (const request of requests) {
			pendingPaginator.prepend(request);
		}
		pendingCount.value += requests.length;
		drafts.value.forEach(revokeDraftPreview);
		drafts.value = [];
		tab.value = 'pending';
		// JUICE: 1回のcreate-many呼び出しで1日あたりの送信回数上限を1消費するため、次にいつ
		// 回復するか(dailyResetAt)も含めて実際の値を取り直す(楽観的な差分計算だとETAの
		// 正確な算出ができない)
		misskeyApi('avatar-decoration-requests/count').then(res => {
			dailyRemaining.value = res.dailyRemaining;
			dailyResetAt.value = res.dailyResetAt;
		});
	}).catch(() => {
		// JUICE: captcha検証失敗時などにウィジェットをリセットし、再送信できるようにする
		hcaptcha.value?.reset?.();
		mcaptcha.value?.reset?.();
		recaptcha.value?.reset?.();
		turnstile.value?.reset?.();
		testcaptcha.value?.reset?.();

		// JUICE: 送信失敗時(他タブでの同時送信・承認/却下等により審査待ち件数が実際とズレて
		// いる可能性がある)は、表示中の残り申請可能数を実際の値に合わせ直す。レート制限に
		// 引っかかった試行自体も1日あたりの送信回数を消費するため、dailyRemaining/dailyResetAtも
		// 合わせて取り直す
		misskeyApi('avatar-decoration-requests/count').then(res => {
			pendingCount.value = res.pending;
			dailyRemaining.value = res.dailyRemaining;
			dailyResetAt.value = res.dailyResetAt;
		});
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => [{
	key: 'form',
	title: i18n.ts._avatarDecorationRequestPage.newRequest,
	icon: 'ti ti-plus',
}, {
	key: 'pending',
	title: i18n.ts._avatarDecorationRequestPage.pendingRequests,
	icon: 'ti ti-clock',
}, {
	key: 'result',
	title: i18n.ts._avatarDecorationRequestPage.requestResults,
	icon: 'ti ti-list-check',
}]);

// JUICE: 送信せずにページを離れた場合、PC選択分の未使用プレビューURLを解放しておく
onUnmounted(() => {
	drafts.value.forEach(revokeDraftPreview);
});

definePage(() => ({
	title: i18n.ts._juice.avatarDecorationRequest,
	icon: 'ti ti-sparkles',
}));
</script>

<style lang="scss" module>
.draftCard {
	padding: 16px;
	border-radius: var(--MI-radius);
	border: var(--MI_THEME-panelBorder);
	background: var(--MI_THEME-panel);
}

.draftHeader {
	display: flex;
	align-items: center;
	font-weight: bold;
}

.draftRemoveButton {
	width: 32px;
	height: 32px;
	// JUICE: 番号ラベル(複数件申請時のみ)が無い1件だけの場合でも、削除ボタンを
	// justify-content: space-betweenに頼らず常に右端へ寄せる
	margin-left: auto;
	color: #ff2a2a;
}

.preview {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.previewLabel {
	font-size: 0.85em;
	opacity: 0.7;
	text-align: center;
}

// JUICE: 管理画面の新規作成ダイアログ(avatar-decoration-edit-dialog.vue)と同じ、
// 明背景・暗背景それぞれでの見え方を並べて確認できるプレビュー
.previewSwatches {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
}

.previewSwatch {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 100px;
	border-radius: var(--MI-radius);

	&.light {
		background: #eee;
	}

	&.dark {
		background: #222;
	}
}

.previewAvatar {
	width: 80px;
	height: 80px;
}

// JUICE: 装着ダイアログと同じ角度・位置・反転の調整UI。
// 幅を絞ると装着ダイアログ版よりスライダーが細く見えてしまうため、
// previewSwatchesと同じくカード幅いっぱいに広げる
.previewControls {
	width: 100%;
}
</style>
