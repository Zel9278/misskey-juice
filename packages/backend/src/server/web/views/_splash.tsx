/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: misskey-tempuraのtty(systemd風起動ログ)・customSplashText(ロゴ下のランダム文言)を参考に追加
export function Splash(props: {
	icon?: string | null;
	customSplashText?: string[] | null;
}) {
	const splashText = getRandomSplashText(props.customSplashText);

	return (
		<div id="splash">
			<div id="tty"></div>
			<img id="splashIcon" src={props.icon || '/static-assets/splash.png'} />
			{splashText != null ? <span id="splashText" safe>{splashText}</span> : null}
			<div id="splashSpinner">
				<svg class="spinner bg" viewBox="0 0 152 152" xmlns="http://www.w3.org/2000/svg">
					<g transform="matrix(1,0,0,1,12,12)">
						<circle cx="64" cy="64" r="64" style="fill:none;stroke:currentColor;stroke-width:24px;"/>
					</g>
				</svg>
				<svg class="spinner fg" viewBox="0 0 152 152" xmlns="http://www.w3.org/2000/svg">
					<g transform="matrix(1,0,0,1,12,12)">
						<path d="M128,64C128,28.654 99.346,0 64,0C99.346,0 128,28.654 128,64Z" style="fill:none;stroke:currentColor;stroke-width:24px;"/>
					</g>
				</svg>
			</div>
		</div>
	);
}

function getRandomSplashText(customSplashText: string[] | null | undefined): string | null {
	if (customSplashText == null || customSplashText.length === 0) return null;
	return customSplashText[Math.floor(Math.random() * customSplashText.length)];
}
