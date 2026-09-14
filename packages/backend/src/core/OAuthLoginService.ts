/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type { OauthLoginProvider } from '@/models/UserOauthConnection.js';

// JUICE: 連携ログイン(Discord/Google/GitHub/GitLab/Microsoft)。プロバイダごとのOAuth2エンドポイント定義。
// Google/Microsoftはid_tokenのJWT検証を行わず、OIDCのuserinfoエンドポイント(相当)をそのまま使う
// (新規にJWT検証ライブラリを増やさないため)
const PROVIDER_DEFS: Record<OauthLoginProvider, {
	authorizeUrl: string;
	tokenUrl: string;
	profileUrl: string;
	scope: string;
	tokenRequestExtraHeaders?: Record<string, string>;
}> = {
	discord: {
		authorizeUrl: 'https://discord.com/oauth2/authorize',
		tokenUrl: 'https://discord.com/api/oauth2/token',
		profileUrl: 'https://discord.com/api/users/@me',
		scope: 'identify',
	},
	google: {
		authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
		scope: 'openid email profile',
	},
	github: {
		authorizeUrl: 'https://github.com/login/oauth/authorize',
		tokenUrl: 'https://github.com/login/oauth/access_token',
		profileUrl: 'https://api.github.com/user',
		scope: 'read:user',
		// GitHubはAcceptヘッダーを指定しないとtoken endpointがform-urlencodedを返す
		tokenRequestExtraHeaders: { Accept: 'application/json' },
	},
	gitlab: {
		authorizeUrl: 'https://gitlab.com/oauth/authorize',
		tokenUrl: 'https://gitlab.com/oauth/token',
		profileUrl: 'https://gitlab.com/api/v4/user',
		scope: 'read_user',
	},
	microsoft: {
		// JUICE: 個人・組織アカウント両対応のため"common"テナントを使う(単一テナント限定にはしない)
		authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
		tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
		profileUrl: 'https://graph.microsoft.com/v1.0/me',
		scope: 'openid email profile User.Read',
	},
};

export type OauthLinkState = {
	mode: 'link';
	userId: string;
	provider: OauthLoginProvider;
	returnTo: string | null;
};

export type OauthSigninState = {
	mode: 'signin';
	provider: OauthLoginProvider;
	returnTo: string | null;
};

export type OauthSigninContext = {
	userId: string;
	returnTo: string | null;
};

export type OauthProviderProfile = {
	providerUserId: string;
	providerUsername: string;
};

const STATE_TTL_SECONDS = 600; // 10分
const CONTEXT_TTL_SECONDS = 120; // 2分(TOTPステップまでの猶予)

@Injectable()
export class OAuthLoginService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private httpRequestService: HttpRequestService,
	) {
	}

	// JUICE: 同一オリジンの相対パスのみ許可する(オープンリダイレクト対策)
	@bindThis
	public sanitizeReturnTo(returnTo: string | null | undefined): string | null {
		if (returnTo == null) return null;
		if (returnTo.length === 0) return null;
		if (!returnTo.startsWith('/')) return null;
		if (returnTo.startsWith('//')) return null;
		if (returnTo.includes('\\')) return null;
		if (returnTo.includes(':')) return null;
		return returnTo;
	}

	@bindThis
	private redirectUri(mode: 'link' | 'signin'): string {
		return `${this.config.apiUrl}/oauth-login/${mode}-callback`;
	}

	@bindThis
	private buildAuthorizeUrl(provider: OauthLoginProvider, clientId: string, mode: 'link' | 'signin', state: string): string {
		const def = PROVIDER_DEFS[provider];
		const params = new URLSearchParams({
			client_id: clientId,
			redirect_uri: this.redirectUri(mode),
			response_type: 'code',
			scope: def.scope,
			state,
		});
		return `${def.authorizeUrl}?${params.toString()}`;
	}

	@bindThis
	public async issueLinkState(payload: Omit<OauthLinkState, 'mode'>, clientId: string): Promise<string> {
		const state = randomUUID();
		await this.redisClient.setex(`oauth:link:state:${state}`, STATE_TTL_SECONDS, JSON.stringify({ mode: 'link', ...payload } satisfies OauthLinkState));
		return this.buildAuthorizeUrl(payload.provider, clientId, 'link', state);
	}

	@bindThis
	public async issueSigninState(payload: Omit<OauthSigninState, 'mode'>, clientId: string): Promise<string> {
		const state = randomUUID();
		await this.redisClient.setex(`oauth:signin:state:${state}`, STATE_TTL_SECONDS, JSON.stringify({ mode: 'signin', ...payload } satisfies OauthSigninState));
		return this.buildAuthorizeUrl(payload.provider, clientId, 'signin', state);
	}

	// JUICE: state値は一度きり(CSRF対策)。getdelで読み取りと同時に消費する
	@bindThis
	public async consumeLinkState(state: string): Promise<OauthLinkState | null> {
		const raw = await this.redisClient.getdel(`oauth:link:state:${state}`);
		if (raw == null) return null;
		return JSON.parse(raw) as OauthLinkState;
	}

	@bindThis
	public async consumeSigninState(state: string): Promise<OauthSigninState | null> {
		const raw = await this.redisClient.getdel(`oauth:signin:state:${state}`);
		if (raw == null) return null;
		return JSON.parse(raw) as OauthSigninState;
	}

	// JUICE: サインイン完了待ちのcontext。2FA有効なアカウントは1回目(next:'totp'を返す)・
	// 2回目(TOTP検証)の2回参照するため、1回目はgetdelせずTTLだけ設定する
	@bindThis
	public async issueSigninContext(payload: OauthSigninContext): Promise<string> {
		const context = randomUUID();
		await this.redisClient.setex(`oauth:signin:context:${context}`, CONTEXT_TTL_SECONDS, JSON.stringify(payload));
		return context;
	}

	@bindThis
	public async getSigninContext(context: string): Promise<OauthSigninContext | null> {
		const raw = await this.redisClient.get(`oauth:signin:context:${context}`);
		if (raw == null) return null;
		return JSON.parse(raw) as OauthSigninContext;
	}

	@bindThis
	public async consumeSigninContext(context: string): Promise<void> {
		await this.redisClient.del(`oauth:signin:context:${context}`);
	}

	// JUICE: 認可コードをアクセストークンに交換し、プロフィールを取得する。
	// アクセストークン自体はこの関数の外に一切持ち出さない(永続化しない)
	@bindThis
	public async exchangeCodeAndFetchProfile(provider: OauthLoginProvider, code: string, clientId: string, clientSecret: string, mode: 'link' | 'signin'): Promise<OauthProviderProfile> {
		const def = PROVIDER_DEFS[provider];

		const params = new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			grant_type: 'authorization_code',
			redirect_uri: this.redirectUri(mode),
		});

		const tokenRes = await this.httpRequestService.send(def.tokenUrl, {
			method: 'POST',
			body: params.toString(),
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json',
				...(def.tokenRequestExtraHeaders ?? {}),
			},
		}, { throwErrorWhenResponseNotOk: false });

		if (!tokenRes.ok) {
			throw new Error(`oauth token exchange failed (${provider}): ${tokenRes.status}`);
		}

		const tokenBody = await tokenRes.json() as { access_token?: string };
		if (!tokenBody.access_token) {
			throw new Error(`oauth token exchange returned no access_token (${provider})`);
		}

		const profile = await this.httpRequestService.getJson<Record<string, unknown>>(def.profileUrl, 'application/json', {
			Authorization: `Bearer ${tokenBody.access_token}`,
		});

		return this.extractProfile(provider, profile);
	}

	@bindThis
	private extractProfile(provider: OauthLoginProvider, profile: Record<string, unknown>): OauthProviderProfile {
		switch (provider) {
			case 'discord': {
				const id = profile.id;
				const username = profile.username;
				if (typeof id !== 'string' || typeof username !== 'string') {
					throw new Error('unexpected discord profile response shape');
				}
				return { providerUserId: id, providerUsername: username };
			}
			case 'google': {
				// OIDC userinfo: subがユーザー識別子
				const sub = profile.sub;
				const email = profile.email;
				if (typeof sub !== 'string') {
					throw new Error('unexpected google profile response shape');
				}
				return { providerUserId: sub, providerUsername: typeof email === 'string' ? email : sub };
			}
			case 'github': {
				const id = profile.id;
				const login = profile.login;
				if (typeof id !== 'number' && typeof id !== 'string') {
					throw new Error('unexpected github profile response shape');
				}
				if (typeof login !== 'string') {
					throw new Error('unexpected github profile response shape');
				}
				return { providerUserId: String(id), providerUsername: login };
			}
			case 'gitlab': {
				const id = profile.id;
				const username = profile.username;
				if (typeof id !== 'number' && typeof id !== 'string') {
					throw new Error('unexpected gitlab profile response shape');
				}
				if (typeof username !== 'string') {
					throw new Error('unexpected gitlab profile response shape');
				}
				return { providerUserId: String(id), providerUsername: username };
			}
			case 'microsoft': {
				// Microsoft Graph /me: idは常に文字列(GUID)。userPrincipalNameが無い(まれな)場合はdisplayNameで代替
				const id = profile.id;
				const userPrincipalName = profile.userPrincipalName;
				const displayName = profile.displayName;
				if (typeof id !== 'string') {
					throw new Error('unexpected microsoft profile response shape');
				}
				const username = typeof userPrincipalName === 'string' ? userPrincipalName : (typeof displayName === 'string' ? displayName : id);
				return { providerUserId: id, providerUsername: username };
			}
		}
	}
}
