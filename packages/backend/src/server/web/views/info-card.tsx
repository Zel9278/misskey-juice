/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { comment, CommonPropsMinimum } from '@/server/web/views/_.js';
import { stripHtmlTags } from '@/misc/strip-html-tags.js';
import type { MiMeta } from '@/models/Meta.js';

export function InfoCardPage(props: CommonPropsMinimum<{
	meta: MiMeta;
}>) {
	// 変数名をsafeで始めることでエラーをスキップ
	const safeDescription = props.meta.description;
	// JUICE: nameはdescriptionと違いHTML表示を意図しないプレーンテキスト項目のため、タグを除去しておく
	const name = props.meta.name != null ? stripHtmlTags(props.meta.name) : props.config.url;

	return (
		<>
			{'<!DOCTYPE html>'}
			{comment}
			<html>
				<head>
					<meta charset="UTF-8" />
					<meta name="application-name" content="Misskey" />
					<meta name="viewport" content="width=device-width, initial-scale=1.0" />
					<title safe>{name}</title>
					<link rel="stylesheet" href="/static-assets/misc/info-card.css" />
				</head>
				<body>
					<a id="a" href={props.config.url} target="_blank" rel="noopener noreferrer">
						<header id="banner" style={props.meta.bannerUrl != null ? `background-image: url(${props.meta.bannerUrl});` : ''}>
							<div id="title" safe>{name}</div>
						</header>
					</a>
					<div id="content">
						<div id="description">{safeDescription}</div>
					</div>
				</body>
			</html>
		</>
	);
}
