<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon>
		<i v-if="contactForm.status === 'resolved'" class="ti ti-check" :class="$style.iconSuccess"></i>
		<i v-else-if="contactForm.status === 'closed'" class="ti ti-x" :class="$style.iconError"></i>
		<i v-else-if="contactForm.status === 'in_progress'" class="ti ti-clock" :class="$style.iconAccent"></i>
		<i v-else class="ti ti-mail" :class="$style.iconWarn"></i>
	</template>
	<template #label>{{ contactForm.subject }}</template>
	<template #caption>{{ getCategoryLabel(contactForm.category) }} | {{ getReplyMethodText(contactForm.replyMethod) }}</template>
	<template #suffix><MkTime :time="contactForm.createdAt"/></template>
	<template #footer>
		<div class="_buttons">
			<MkSelect v-model="currentStatus" :class="$style.statusSelect" :items="statusOptions">
				<template #label>{{ i18n.ts._contactForm._adminStatus.updateStatus }}</template>
			</MkSelect>
			<MkButton primary @click="updateStatus"><i class="ti ti-check"></i> {{ i18n.ts.update }}</MkButton>
			<MkButton @click="deleteForm"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
			<button class="_button" :class="$style.menuButton" @click="showMenu"><i class="ti ti-dots"></i></button>
		</div>
	</template>

	<div class="_gaps_s">
		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-message-2"></i></template>
			<template #label>{{ i18n.ts._contactForm._adminDetail.submittedContent }}</template>
			<div class="_gaps_s">
				<Mfm :text="contactForm.content" :linkNavigationBehavior="'window'"/>
			</div>
		</MkFolder>

		<MkFolder>
			<template #icon><i class="ti ti-user"></i></template>
			<template #label>{{ i18n.ts._contactForm._adminDetail.contactInfo }}</template>
			<div class="_gaps_s">
				<MkKeyValue>
					<template #key>{{ i18n.ts._contactForm._userForm.name }}</template>
					<template #value>{{ contactForm.name || i18n.ts.none }}</template>
				</MkKeyValue>
				<MkKeyValue v-if="contactForm.replyMethod === 'email'">
					<template #key>{{ i18n.ts._contactForm._userForm.email }}</template>
					<template #value>{{ contactForm.email }}</template>
				</MkKeyValue>
				<MkKeyValue v-if="contactForm.replyMethod === 'misskey'">
					<template #key>{{ i18n.ts._contactForm._userForm.misskeyUsername }}</template>
					<template #value><Mfm :text="`@${contactForm.misskeyUsername}`" :linkNavigationBehavior="'window'"/></template>
				</MkKeyValue>
				<MkKeyValue v-if="contactForm.user">
					<template #key>{{ i18n.ts._contactForm._userForm.registeredUser }}</template>
					<template #value><Mfm :text="`@${contactForm.user.username}${contactForm.user.host ? '@' + contactForm.user.host : ''}`" :linkNavigationBehavior="'window'"/></template>
				</MkKeyValue>
				<MkKeyValue v-if="contactForm.ipAddress">
					<template #key>{{ i18n.ts._contactForm._adminDetail.ipAddress }}</template>
					<template #value>{{ contactForm.ipAddress }}</template>
				</MkKeyValue>
				<MkKeyValue v-if="contactForm.userAgent">
					<template #key>{{ i18n.ts._contactForm._adminDetail.userAgent }}</template>
					<template #value><span :title="contactForm.userAgent">{{ truncateUserAgent(contactForm.userAgent) }}</span></template>
				</MkKeyValue>
			</div>
		</MkFolder>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-note"></i></template>
			<template #label>{{ i18n.ts._contactForm._adminDetail.adminNote }}</template>
			<template #suffix>{{ adminNotePreview }} <span v-if="adminNoteChanged" :class="$style.changedMark">*</span></template>
			<div class="_gaps_s">
				<MkTextarea v-model="adminNote">
					<template #caption>{{ i18n.ts.moderationNoteDescription }}</template>
				</MkTextarea>
				<MkButton v-if="adminNoteChanged" primary @click="saveAdminNote">
					<i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}
				</MkButton>
			</div>
		</MkFolder>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-user-check"></i></template>
			<template #label>{{ i18n.ts._contactForm._adminDetail.assign }}</template>
			<div class="_gaps_s">
				<MkInput v-model="assignedUsername" type="text" :spellcheck="false" :placeholder="i18n.ts._contactForm._adminDetail.placeholderAssignedUser">
					<template #label>{{ i18n.ts._contactForm._adminDetail.assignedUser }}</template>
				</MkInput>
				<MkButton primary @click="assignUser"><i class="ti ti-check"></i> {{ i18n.ts._contactForm._adminDetail.assign }}</MkButton>
			</div>
		</MkFolder>

		<div v-if="contactForm.assignedUser || contactForm.assignedNickname" :class="$style.assignedUserDisplay">
			{{ i18n.ts._contactForm._adminDetail.assignedUser }}:
			<span v-if="contactForm.assignedUser" :class="$style.assignedUserMention">
				<Mfm :text="`@${contactForm.assignedUser.username}${contactForm.assignedUser.host ? '@' + contactForm.assignedUser.host : ''}`" :linkNavigationBehavior="'window'"/>
			</span>
			<span v-else-if="contactForm.assignedNickname" :class="$style.assignedNickname">
				{{ contactForm.assignedNickname }}
			</span>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInput from '@/components/MkInput.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useContactFormCategories } from '@/composables/useContactFormCategories.js';

// JUICE: misskey-tempuraのコンタクトフォームを参考に追加
// 承認/却下のワークフローを持たない(pending/in_progress/resolved/closedのチケット管理)ため、
// MkEmojiRequestApproval等の"...Approval"系とは意味論が異なりMkContactFormTicketと命名している
const props = defineProps<{
	contactForm: Misskey.entities.ContactForm;
}>();

const emit = defineEmits<{
	(ev: 'updated', contactForm: Misskey.entities.ContactForm): void;
	(ev: 'deleted', contactFormId: string): void;
}>();

const { fetchCategories, getCategoryLabel } = useContactFormCategories();
fetchCategories({ includeDisabled: true });

const statusOptions = [
	{ value: 'pending', label: i18n.ts._contactForm._adminStatus.pending },
	{ value: 'in_progress', label: i18n.ts._contactForm._adminStatus.inProgress },
	{ value: 'resolved', label: i18n.ts._contactForm._adminStatus.resolved },
	{ value: 'closed', label: i18n.ts._contactForm._adminStatus.closed },
];

const currentStatus = ref(props.contactForm.status);
const adminNote = ref(props.contactForm.adminNote ?? '');
const assignedUsername = ref('');

const adminNoteChanged = computed(() => {
	const normalizeValue = (val: string | null | undefined): string => val ?? '';
	return normalizeValue(adminNote.value) !== normalizeValue(props.contactForm.adminNote);
});

const adminNotePreview = computed(() => {
	if (!adminNote.value || adminNote.value.trim() === '') {
		return i18n.ts.none;
	}

	const firstLine = adminNote.value.split('\n')[0].trim();
	if (firstLine.length <= 30) {
		return firstLine;
	}
	return firstLine.substring(0, 27) + '...';
});

async function refreshAndEmit() {
	const fresh = await misskeyApi('admin/contact-form/show', { contactFormId: props.contactForm.id });
	emit('updated', fresh);
}

async function saveAdminNote() {
	if (!adminNoteChanged.value) return;

	await os.apiWithDialog('admin/contact-form/update', {
		contactFormId: props.contactForm.id,
		adminNote: adminNote.value,
	});
	await refreshAndEmit();
}

async function updateStatus() {
	try {
		await misskeyApi('admin/contact-form/update', {
			contactFormId: props.contactForm.id,
			status: currentStatus.value,
		});
		await refreshAndEmit();
		os.toast(i18n.ts.saved);
	} catch (err) {
		os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
		currentStatus.value = props.contactForm.status;
	}
}

async function assignUser() {
	if (!assignedUsername.value) return;

	try {
		const input = assignedUsername.value.trim();

		if (input.startsWith('@')) {
			const cleanInput = input.replace(/^@/, '');
			let username: string;
			let host: string | null;

			if (cleanInput.includes('@')) {
				const parts = cleanInput.split('@');
				username = parts[0];
				host = parts[1];
			} else {
				username = cleanInput;
				host = null;
			}

			const user = await misskeyApi('users/show', { username, host });

			await misskeyApi('admin/contact-form/update', {
				contactFormId: props.contactForm.id,
				assignedUserId: user.id,
				assignedNickname: null,
			});
		} else {
			await misskeyApi('admin/contact-form/update', {
				contactFormId: props.contactForm.id,
				assignedUserId: null,
				assignedNickname: input,
			});
		}

		assignedUsername.value = '';
		await refreshAndEmit();
	} catch (err) {
		if (err && typeof err === 'object' && 'code' in err && err.code === 'NO_SUCH_USER') {
			os.alert({
				type: 'error',
				text: i18n.ts.noSuchUser,
			});
			return;
		}

		os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
	}
}

function deleteForm() {
	os.confirm({
		type: 'warning',
		text: i18n.ts.deleteConfirm,
	}).then(({ canceled }) => {
		if (canceled) return;
		misskeyApi('admin/contact-form/delete', {
			contactFormId: props.contactForm.id,
		}).then(() => {
			emit('deleted', props.contactForm.id);
			os.toast(i18n.ts._contactForm._adminDetail.deleted);
		}).catch(() => {
			os.alert({
				type: 'error',
				text: i18n.ts.somethingHappened,
			});
		});
	});
}

function getReplyMethodText(replyMethod: string): string {
	return replyMethod === 'email' ? i18n.ts._contactForm._userForm.replyByEmail : i18n.ts._contactForm._userForm.replyByMisskey;
}

function truncateUserAgent(userAgent: string): string {
	if (userAgent.length <= 80) return userAgent;
	return userAgent.substring(0, 77) + '...';
}

function showMenu(ev: MouseEvent) {
	os.popupMenu([{
		icon: 'ti ti-hash',
		text: 'Copy ID',
		action: () => {
			copyToClipboard(props.contactForm.id);
		},
	}, {
		icon: 'ti ti-json',
		text: 'Copy JSON',
		action: () => {
			copyToClipboard(JSON.stringify(props.contactForm, null, '\t'));
		},
	}], ev.currentTarget ?? ev.target);
}
</script>

<style lang="scss" module>
.iconSuccess {
	color: var(--MI_THEME-success);
}

.iconError {
	color: var(--MI_THEME-error);
}

.iconAccent {
	color: var(--MI_THEME-accent);
}

.iconWarn {
	color: var(--MI_THEME-warn);
}

.statusSelect {
	margin: 0;
	flex: 1;
}

.menuButton {
	margin-left: auto;
	width: 34px;
}

.changedMark {
	color: var(--MI_THEME-warn);
	font-weight: bold;
}

.assignedUserDisplay {
	margin-top: 8px;
}

.assignedUserMention {
	margin-left: 8px;
	opacity: 0.8;
}

.assignedNickname {
	margin-left: 8px;
	font-weight: 500;
}
</style>
