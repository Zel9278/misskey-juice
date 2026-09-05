<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" class="hiyeyicy" :class="{ wide: !narrow }">
	<div v-if="!narrow || currentPage?.route.name == null" class="nav">
		<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px;">
			<div class="lxpfedzu _gaps">
				<div class="banner">
					<img :src="instance.iconUrl || '/favicon.ico'" alt="" class="icon"/>
				</div>

				<div class="_gaps_s">
					<MkInfo v-if="thereIsUnresolvedAbuseReport" warn>{{ i18n.ts.thereIsUnresolvedAbuseReportWarning }} <MkA to="/admin/abuses" class="_link">{{ i18n.ts.check }}</MkA></MkInfo>
					<MkInfo v-if="thereArePendingEmojiRequests" warn>{{ i18n.ts._juice.thereArePendingEmojiRequestsWarning }} <MkA to="/admin/emoji-requests" class="_link">{{ i18n.ts.check }}</MkA></MkInfo>
					<MkInfo v-if="thereArePendingSignupApplications" warn>{{ i18n.ts._juice.thereArePendingSignupApplicationsWarning }} <MkA to="/admin/juice-approvals" class="_link">{{ i18n.ts.check }}</MkA></MkInfo>
					<MkInfo v-if="thereArePendingAvatarDecorationRequests" warn>{{ i18n.ts._juice.thereArePendingAvatarDecorationRequestsWarning }} <MkA to="/admin/avatar-decoration-requests" class="_link">{{ i18n.ts.check }}</MkA></MkInfo>
					<MkInfo v-if="noMaintainerInformation" warn>{{ i18n.ts.noMaintainerInformationWarning }} <MkA to="/admin/settings" class="_link">{{ i18n.ts.configure }}</MkA></MkInfo>
					<MkInfo v-if="noInquiryUrl" warn>{{ i18n.ts.noInquiryUrlWarning }} <MkA to="/admin/settings" class="_link">{{ i18n.ts.configure }}</MkA></MkInfo>
					<MkInfo v-if="noBotProtection" warn>{{ i18n.ts.noBotProtectionWarning }} <MkA to="/admin/security" class="_link">{{ i18n.ts.configure }}</MkA></MkInfo>
					<MkInfo v-if="noEmailServer" warn>{{ i18n.ts.noEmailServerWarning }} <MkA to="/admin/email-settings" class="_link">{{ i18n.ts.configure }}</MkA></MkInfo>
				</div>

				<MkSuperMenu :def="menuDef" :searchIndex="searchIndex" :grid="narrow"></MkSuperMenu>
			</div>
		</div>
	</div>
	<div v-if="!(narrow && currentPage?.route.name == null)" class="main _pageContainer" style="height: 100%;">
		<NestedRouterView/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onActivated, onDeactivated, onMounted, onUnmounted, provide, watch, ref, computed, markRaw } from 'vue';
import type { SuperMenuDef } from '@/components/MkSuperMenu.vue';
import type { PageMetadata } from '@/page.js';
import { i18n } from '@/i18n.js';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import MkInfo from '@/components/MkInfo.vue';
import { instance } from '@/instance.js';
import { lookup } from '@/utility/lookup.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { lookupUser, lookupUserByEmail, lookupFile } from '@/utility/admin-lookup.js';
import { definePage, provideMetadataReceiver, provideReactiveMetadata } from '@/page.js';
import { useRouter } from '@/router.js';
import { genSearchIndexes } from '@/utility/inapp-search.js';
import { useStream } from '@/stream.js';

const searchIndex = await import('search-index:admin').then(({ searchIndexes }) => genSearchIndexes(searchIndexes));

const isEmpty = (x: string | null) => x == null || x === '';

const router = useRouter();

const indexInfo = {
	title: i18n.ts.controlPanel,
	icon: 'ti ti-settings',
	hideHeader: true,
};

provide('shouldOmitHeaderTitle', false);

const INFO = ref<PageMetadata>(indexInfo);
const childInfo = ref<null | PageMetadata>(null);
const narrow = ref(false);
const view = ref(null);
const el = ref<HTMLDivElement | null>(null);
const pageProps = ref({});
const noMaintainerInformation = computed(() => isEmpty(instance.maintainerName) || isEmpty(instance.maintainerEmail));
const noBotProtection = computed(() => !instance.disableRegistration && !instance.enableHcaptcha && !instance.enableRecaptcha && !instance.enableTurnstile && !instance.enableMcaptcha);
const noEmailServer = computed(() => !instance.enableEmail);
const noInquiryUrl = computed(() => isEmpty(instance.inquiryUrl));
const thereIsUnresolvedAbuseReport = ref(false);
// JUICE: 通報と同じく、未対応の絵文字申請・承認式登録申請がある場合に警告バナーを出す
const thereArePendingEmojiRequests = ref(false);
const thereArePendingSignupApplications = ref(false);
const thereArePendingAvatarDecorationRequests = ref(false);
const currentPage = computed(() => router.currentRef.value.child);

misskeyApi('admin/abuse-user-reports', {
	state: 'unresolved',
	limit: 1,
}).then(reports => {
	if (reports.length > 0) thereIsUnresolvedAbuseReport.value = true;
});

// JUICE
misskeyApi('admin/emoji-requests/list', {
	state: 'pending',
	limit: 1,
}).then(requests => {
	if (requests.length > 0) thereArePendingEmojiRequests.value = true;
});

// JUICE
misskeyApi('admin/juice/pending-signups', {
	limit: 1,
}).then(users => {
	if (users.length > 0) thereArePendingSignupApplications.value = true;
});

// JUICE
misskeyApi('admin/avatar-decoration-requests/list', {
	state: 'pending',
	limit: 1,
}).then(requests => {
	if (requests.length > 0) thereArePendingAvatarDecorationRequests.value = true;
});

const NARROW_THRESHOLD = 600;
const ro = new ResizeObserver((entries, observer) => {
	if (entries.length === 0) return;
	narrow.value = entries[0].borderBoxSize[0].inlineSize < NARROW_THRESHOLD;
});

const menuDef = computed<SuperMenuDef[]>(() => [{
	title: i18n.ts.quickAction,
	items: [{
		type: 'button',
		icon: 'ti ti-search',
		text: i18n.ts.lookup,
		action: adminLookup,
	}, ...(instance.disableRegistration ? [{
		type: 'button' as const,
		icon: 'ti ti-user-plus',
		text: i18n.ts.createInviteCode,
		action: invite,
	}] : [])],
}, {
	title: i18n.ts.administration,
	items: [{
		icon: 'ti ti-dashboard',
		text: i18n.ts.dashboard,
		to: '/admin/overview',
		active: currentPage.value?.route.name === 'overview',
	}, {
		icon: 'ti ti-users',
		text: i18n.ts.users,
		to: '/admin/users',
		active: currentPage.value?.route.name === 'users',
	}, {
		icon: 'ti ti-user-plus',
		text: i18n.ts.invite,
		to: '/admin/invites',
		active: currentPage.value?.route.name === 'invites',
	}, {
		icon: 'ti ti-badges',
		text: i18n.ts.roles,
		to: '/admin/roles',
		active: currentPage.value?.route.name === 'roles',
	}, {
		icon: 'ti ti-icons',
		text: i18n.ts.customEmojis,
		to: '/admin/emojis',
		active: currentPage.value?.route.name === 'emojis',
	}, {
		icon: 'ti ti-icons',
		text: i18n.ts.customEmojis + '(beta)',
		to: '/admin/emojis2',
		active: currentPage.value?.route.name === 'emojis2',
	}, {
		icon: 'ti ti-sparkles',
		text: i18n.ts.avatarDecorations,
		to: '/admin/avatar-decorations',
		active: currentPage.value?.route.name === 'avatarDecorations',
	}, {
		icon: 'ti ti-whirl',
		text: i18n.ts.federation,
		to: '/admin/federation',
		active: currentPage.value?.route.name === 'federation',
	}, {
		icon: 'ti ti-clock-play',
		text: i18n.ts.federationJobs,
		to: '/admin/federation-job-queue',
		active: currentPage.value?.route.name === 'federationJobQueue',
	}, {
		icon: 'ti ti-clock-play',
		text: i18n.ts.jobQueue,
		to: '/admin/job-queue',
		active: currentPage.value?.route.name === 'jobQueue',
	}, {
		icon: 'ti ti-cloud',
		text: i18n.ts.files,
		to: '/admin/files',
		active: currentPage.value?.route.name === 'files',
	}, {
		icon: 'ti ti-speakerphone',
		text: i18n.ts.announcements,
		to: '/admin/announcements',
		active: currentPage.value?.route.name === 'announcements',
	}, {
		icon: 'ti ti-ad',
		text: i18n.ts.ads,
		to: '/admin/ads',
		active: currentPage.value?.route.name === 'ads',
	}, {
		icon: 'ti ti-exclamation-circle',
		text: i18n.ts.abuseReports,
		to: '/admin/abuses',
		active: currentPage.value?.route.name === 'abuses',
	}, {
		icon: 'ti ti-list-search',
		text: i18n.ts.moderationLogs,
		to: '/admin/modlog',
		active: currentPage.value?.route.name === 'modlog',
	}],
}, {
	title: i18n.ts.settings,
	items: [{
		icon: 'ti ti-settings',
		text: i18n.ts.general,
		to: '/admin/settings',
		active: currentPage.value?.route.name === 'settings',
	}, {
		icon: 'ti ti-paint',
		text: i18n.ts.branding,
		to: '/admin/branding',
		active: currentPage.value?.route.name === 'branding',
	}, {
		icon: 'ti ti-shield',
		text: i18n.ts.moderation,
		to: '/admin/moderation',
		active: currentPage.value?.route.name === 'moderation',
	}, {
		icon: 'ti ti-mail',
		text: i18n.ts.emailServer,
		to: '/admin/email-settings',
		active: currentPage.value?.route.name === 'email-settings',
	}, {
		icon: 'ti ti-cloud',
		text: i18n.ts.objectStorage,
		to: '/admin/object-storage',
		active: currentPage.value?.route.name === 'object-storage',
	}, {
		icon: 'ti ti-lock',
		text: i18n.ts.security,
		to: '/admin/security',
		active: currentPage.value?.route.name === 'security',
	}, {
		icon: 'ti ti-planet',
		text: i18n.ts.relays,
		to: '/admin/relays',
		active: currentPage.value?.route.name === 'relays',
	}, {
		icon: 'ti ti-link',
		text: i18n.ts.externalServices,
		to: '/admin/external-services',
		active: currentPage.value?.route.name === 'external-services',
	}, {
		icon: 'ti ti-webhook',
		text: 'Webhook',
		to: '/admin/system-webhook',
		active: currentPage.value?.route.name === 'system-webhook',
	}, {
		icon: 'ti ti-bolt',
		text: i18n.ts.performance,
		to: '/admin/performance',
		active: currentPage.value?.route.name === 'performance',
	}],
}, {
	title: i18n.ts.juice,
	items: [{
		icon: 'ti ti-droplet',
		text: i18n.ts.juice,
		to: '/admin/juice',
		active: currentPage.value?.route.name === 'juice',
	}, {
		icon: 'ti ti-user-question',
		text: i18n.ts._juiceApprovals.title,
		to: '/admin/juice-approvals',
		active: currentPage.value?.route.name === 'juice-approvals',
		badge: true,
	}, {
		icon: 'ti ti-mood-plus',
		text: i18n.ts._emojiRequestApprovals.title,
		to: '/admin/emoji-requests',
		active: currentPage.value?.route.name === 'emoji-requests',
		badge: true,
	}, {
		icon: 'ti ti-sparkles',
		text: i18n.ts._avatarDecorationRequestApprovals.title,
		to: '/admin/avatar-decoration-requests',
		active: currentPage.value?.route.name === 'avatar-decoration-requests',
		badge: true,
	}, {
		icon: 'ti ti-mail',
		text: i18n.ts._contactForm._adminList.list,
		to: '/admin/contact-form',
		active: currentPage.value?.route.name === 'contact-form',
		badge: true,
	}, {
		icon: 'ti ti-forms',
		text: i18n.ts._contactForm._category.categoryManagement,
		to: '/admin/contact-form-categories',
		active: currentPage.value?.route.name === 'contact-form-categories',
		badge: true,
	}],
}, {
	title: i18n.ts.info,
	items: [{
		icon: 'ti ti-database',
		text: i18n.ts.database,
		to: '/admin/database',
		active: currentPage.value?.route.name === 'database',
	}],
}]);

// JUICE: 通報・絵文字申請・承認式登録申請をコントロールパネルを開いている間だけリアルタイム通知する。
// 本家にはadminストリームチャンネル自体は既にあったが、フロントエンドで購読する実装が無かったため新設した。
const adminConnection = markRaw(useStream().useChannel('admin'));

function onNewAbuseUserReport() {
	os.toast(i18n.ts.newAbuseReportToast);
	thereIsUnresolvedAbuseReport.value = true;
}

function onNewEmojiRequest() {
	os.toast(i18n.ts._juice.newEmojiRequestToast);
	thereArePendingEmojiRequests.value = true;
}

function onNewSignupApplication() {
	os.toast(i18n.ts._juice.newSignupApplicationToast);
	thereArePendingSignupApplications.value = true;
}

function onNewAvatarDecorationRequest() {
	os.toast(i18n.ts._juice.newAvatarDecorationRequestToast);
	thereArePendingAvatarDecorationRequests.value = true;
}

onMounted(() => {
	if (el.value != null) {
		ro.observe(el.value);
		narrow.value = el.value.offsetWidth < NARROW_THRESHOLD;
	}
	if (currentPage.value?.route.name == null && !narrow.value) {
		router.replace('/admin/overview');
	}
});

// JUICE: このページはKeepAliveでキャッシュされるため、他ページへ遷移している間は
// onActivated/onDeactivatedでadminストリームの購読をon/offし、「コントロールパネルを
// 開いている間だけ」という設計意図をKeepAlive中も保つ(onMounted/onUnmountedだけだと
// キャッシュから追い出されるまで購読が生き続けてしまう)。
onActivated(() => {
	if (el.value != null) {
		narrow.value = el.value.offsetWidth < NARROW_THRESHOLD;
	}
	if (currentPage.value?.route.name == null && !narrow.value) {
		router.replace('/admin/overview');
	}

	adminConnection.on('newAbuseUserReport', onNewAbuseUserReport);
	adminConnection.on('newEmojiRequest', onNewEmojiRequest);
	adminConnection.on('newSignupApplication', onNewSignupApplication);
	adminConnection.on('newAvatarDecorationRequest', onNewAvatarDecorationRequest);
});

onDeactivated(() => {
	adminConnection.off('newAbuseUserReport', onNewAbuseUserReport);
	adminConnection.off('newEmojiRequest', onNewEmojiRequest);
	adminConnection.off('newSignupApplication', onNewSignupApplication);
	adminConnection.off('newAvatarDecorationRequest', onNewAvatarDecorationRequest);
});

onUnmounted(() => {
	ro.disconnect();
	adminConnection.dispose();
});

watch(router.currentRef, (to) => {
	if (to.route.path === '/admin' && to.child?.route.name == null && !narrow.value) {
		router.replace('/admin/overview');
	}
});

provideMetadataReceiver((metadataGetter) => {
	const info = metadataGetter();
	if (info == null) {
		childInfo.value = null;
	} else {
		childInfo.value = info;
		INFO.value.needWideArea = info.needWideArea ?? undefined;
	}
});
provideReactiveMetadata(INFO);

function invite() {
	misskeyApi('admin/invite/create').then(x => {
		os.alert({
			type: 'info',
			text: x[0].code,
		});
	}).catch(err => {
		os.alert({
			type: 'error',
			text: err,
		});
	});
}

function adminLookup(ev: PointerEvent) {
	os.popupMenu([{
		text: i18n.ts.user,
		icon: 'ti ti-user',
		action: () => {
			lookupUser();
		},
	}, {
		text: `${i18n.ts.user} (${i18n.ts.email})`,
		icon: 'ti ti-user',
		action: () => {
			lookupUserByEmail();
		},
	}, {
		text: i18n.ts.file,
		icon: 'ti ti-cloud',
		action: () => {
			lookupFile();
		},
	}, {
		text: i18n.ts.lookup,
		icon: 'ti ti-world-search',
		action: () => {
			lookup();
		},
	}], ev.currentTarget ?? ev.target);
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => INFO.value);
</script>

<style lang="scss" scoped>
.hiyeyicy {
	height: 100%;

	&.wide {
		display: flex;
		margin: 0 auto;

		> .nav {
			position: sticky;
			top: 0;
			width: 32%;
			max-width: 280px;
			box-sizing: border-box;
			border-right: solid 0.5px var(--MI_THEME-divider);
			overflow: auto;
			height: 100cqh;
		}

		> .main {
			flex: 1;
			min-width: 0;
		}
	}

	> .nav {
		.lxpfedzu {
			> .banner {
				margin: 16px;

				> .icon {
					display: block;
					margin: auto;
					height: 42px;
					border-radius: 8px;
				}
			}
		}
	}
}
</style>
