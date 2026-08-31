<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Mfm :text="displayName" :author="user" :plain="true" :nowrap="nowrap" :emojiUrls="user.emojis"/>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';

const props = withDefaults(defineProps<{
	user: Misskey.entities.User;
	nowrap?: boolean;
	// JUICE: trueのときだけニックネームを表示名として使う。プロフィールページ・ユーザー
	// ホバープレビュー以外では明示的に渡さないこと(タイムライン・通知・フォロー一覧等、
	// UserDetailedが渡される画面は他にもあるため、nicknameフィールドの有無だけでは
	// 表示範囲を絞り込めない)。
	respectNickname?: boolean;
}>(), {
	nowrap: true,
	respectNickname: false,
});

const displayName = computed(() => {
	if (props.respectNickname && 'nickname' in props.user && props.user.nickname) return props.user.nickname;
	return props.user.name ?? props.user.username;
});
</script>
