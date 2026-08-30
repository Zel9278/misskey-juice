<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<div>{{ i18n.ts._signupCheck.description }}</div>

	<div v-if="entries.length > 0" class="_gaps_s">
		<div v-for="entry in entries" :key="entry.code" :class="$style.entry">
			<div :class="$style.entryHeader">
				<span :class="$style.entryCode">{{ entry.code }}</span>
				<button class="_button" :class="$style.entryRemove" :title="i18n.ts.remove" @click="removeEntry(entry.code)"><i class="ti ti-x"></i></button>
			</div>
			<MkLoading v-if="entry.checking" mini/>
			<template v-else>
				<MkInfo v-if="entry.status === 'pending'" warn>{{ i18n.ts._signupCheck.statusPending }}</MkInfo>
				<MkInfo v-else-if="entry.status === 'approved'">
					{{ i18n.ts._signupCheck.statusApproved }}
					<MkButton style="margin-top: 8px;" @click="openSignin()">{{ i18n.ts._signupCheck.goToSignin }}</MkButton>
				</MkInfo>
				<MkInfo v-else-if="entry.status === 'declined'" warn>{{ i18n.ts._signupCheck.statusDeclined }}</MkInfo>
				<MkInfo v-else-if="entry.status === 'notFound'" warn>{{ i18n.ts._signupCheck.statusNotFound }}</MkInfo>
				<MkInfo v-else-if="entry.status === 'error'" warn>{{ i18n.ts.somethingHappened }}</MkInfo>
			</template>
		</div>
	</div>

	<FormSection>
		<template #label>{{ i18n.ts._signupCheck.addCode }}</template>
		<div class="_gaps_s">
			<MkInput v-model="newCode" type="text">
				<template #label>{{ i18n.ts._signupCheck.codeLabel }}</template>
			</MkInput>
			<MkCaptcha v-if="instance.enableHcaptcha" ref="hcaptcha" v-model="hCaptchaResponse" provider="hcaptcha" :sitekey="instance.hcaptchaSiteKey"/>
			<MkCaptcha v-if="instance.enableMcaptcha" ref="mcaptcha" v-model="mCaptchaResponse" provider="mcaptcha" :sitekey="instance.mcaptchaSiteKey" :instanceUrl="instance.mcaptchaInstanceUrl"/>
			<MkCaptcha v-if="instance.enableRecaptcha" ref="recaptcha" v-model="reCaptchaResponse" provider="recaptcha" :sitekey="instance.recaptchaSiteKey"/>
			<MkCaptcha v-if="instance.enableTurnstile" ref="turnstile" v-model="turnstileResponse" provider="turnstile" :sitekey="instance.turnstileSiteKey"/>
			<MkCaptcha v-if="instance.enableTestcaptcha" ref="testcaptcha" v-model="testcaptchaResponse" provider="testcaptcha" :sitekey="null"/>
			<MkButton gradate large rounded :disabled="shouldDisableAdding" style="margin: 0 auto;" @click="addAndCheck()">
				{{ adding ? i18n.ts.processing : i18n.ts._signupCheck.check }}<MkEllipsis v-if="adding"/>
			</MkButton>
		</div>
	</FormSection>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, onMounted } from 'vue';
import FormSection from '@/components/form/section.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import type { Captcha } from '@/components/MkCaptcha.vue';
import MkCaptcha from '@/components/MkCaptcha.vue';
import XSigninDialog from '@/components/MkSigninDialog.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { instance } from '@/instance.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { addSignupApprovalCheckCode, getSignupApprovalCheckCodes, removeSignupApprovalCheckCode } from '@/utility/signup-approval-check-codes.js';

type Status = 'pending' | 'approved' | 'declined' | 'notFound' | 'error';

type Entry = {
	code: string;
	status: Status | null;
	checking: boolean;
};

const entries = ref<Entry[]>([]);
const newCode = ref('');
const adding = ref(false);

// JUICE: 新規コード追加時のみcaptchaを必須にする(保存済みコードの自動再確認では要求しない)
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

const shouldDisableAdding = computed((): boolean => {
	return adding.value || newCode.value === '' ||
		instance.enableHcaptcha && !hCaptchaResponse.value ||
		instance.enableMcaptcha && !mCaptchaResponse.value ||
		instance.enableRecaptcha && !reCaptchaResponse.value ||
		instance.enableTurnstile && !turnstileResponse.value ||
		instance.enableTestcaptcha && !testcaptchaResponse.value;
});

function resetCaptchas() {
	hcaptcha.value?.reset?.();
	mcaptcha.value?.reset?.();
	recaptcha.value?.reset?.();
	turnstile.value?.reset?.();
	testcaptcha.value?.reset?.();
}

// リスト内の全エントリを一括で再確認する際に、通信エラーのたびにos.alertが積み上がるのを避けるため、
// ここでは例外を投げずに'error'ステータスとして返し、呼び出し側でインライン表示させる(JUICE)。
// captchaはisNewSubmission(新規コード追加時)のみ送る(JUICE)。
async function checkStatus(code: string, isNewSubmission = false): Promise<Status> {
	try {
		const res = await misskeyApi('juice/signup-check-status', {
			code,
			isNewSubmission,
			'hcaptcha-response': isNewSubmission ? hCaptchaResponse.value : undefined,
			'm-captcha-response': isNewSubmission ? mCaptchaResponse.value : undefined,
			'g-recaptcha-response': isNewSubmission ? reCaptchaResponse.value : undefined,
			'turnstile-response': isNewSubmission ? turnstileResponse.value : undefined,
			'testcaptcha-response': isNewSubmission ? testcaptchaResponse.value : undefined,
		});
		return res.status;
	} catch {
		return 'error';
	}
}

// JUICE: pleaseLogin()は既にログイン中(≠承認されたこのアカウント)だと何もせず即returnしてしまい、
// 別アカウントでログイン中にこのボタンを押しても無反応に見えるため、常にダイアログを開くMkSigninDialogを直接使う
function openSignin() {
	const { dispose } = os.popup(XSigninDialog, {
		autoSet: true,
	}, {
		closed: () => dispose(),
	});
}

async function refreshEntry(entry: Entry) {
	entry.checking = true;
	entry.status = await checkStatus(entry.code);
	entry.checking = false;
}

function removeEntry(code: string) {
	removeSignupApprovalCheckCode(code);
	entries.value = entries.value.filter(e => e.code !== code);
}

async function addAndCheck() {
	if (adding.value || newCode.value === '') return;
	const code = newCode.value;
	adding.value = true;

	const status = await checkStatus(code, true);

	if (status === 'error') {
		os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
	} else if (status === 'notFound') {
		// 見つからなかったコードは端末に保存しない(タイプミス等が一覧に残り続けるのを防ぐ)
		os.alert({
			type: 'warning',
			text: i18n.ts._signupCheck.statusNotFound,
		});
	} else {
		addSignupApprovalCheckCode(code);
		const existing = entries.value.find(e => e.code === code);
		if (existing) {
			existing.status = status;
		} else {
			entries.value.unshift({ code, status, checking: false });
		}
		newCode.value = '';
	}

	// JUICE: captchaトークンは1回使い切りのため、結果によらず次回に備えてリセットする
	resetCaptchas();
	adding.value = false;
}

onMounted(() => {
	entries.value = getSignupApprovalCheckCodes().map(code => ({ code, status: null, checking: false }));
	for (const entry of entries.value) {
		refreshEntry(entry);
	}
});
</script>

<style lang="scss" module>
.entry {
	padding: 12px;
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
}

.entryHeader {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 8px;
}

.entryCode {
	flex: 1;
	font-family: monospace;
	word-break: break-all;
}

.entryRemove {
	width: 24px;
	height: 24px;
	display: flex;
	align-items: center;
	justify-content: center;
	opacity: 0.7;

	&:hover {
		opacity: 1;
	}
}
</style>
