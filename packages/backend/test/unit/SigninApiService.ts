/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IncomingHttpHeaders } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { HttpHeader } from 'fastify/types/utils.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { DI } from '@/di-symbols.js';
import { CoreModule } from '@/core/CoreModule.js';
import { SigninApiService } from '@/server/api/SigninApiService.js';
import { RateLimiterService } from '@/server/api/RateLimiterService.js';
import { SigninService } from '@/server/api/SigninService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { EmailService } from '@/core/EmailService.js';
import { EmailI18nService } from '@/core/EmailI18nService.js';

class FakeLimiter {
	public async limit() {
		return;
	}
}

class FakeSigninService {
	public signin(..._args: any): any {
		return { finished: true, id: 'dummy', i: 'dummy-token' };
	}
}

class FakeNotificationService {
	public createNotification = vi.fn();
}

class FakeEmailService {
	public sendEmail = vi.fn();
}

class FakeEmailI18nService {
	public async resolveLang() {
		return 'ja-JP';
	}
	public getI18n() {
		return { t: (_key: string) => 'dummy' };
	}
}

class DummyFastifyReply {
	public statusCode: number;
	code(num: number): void {
		this.statusCode = num;
	}
	header(_key: HttpHeader, _value: any): void {
	}
}
class DummyFastifyRequest {
	public ip: string;
	public body: any;
	public headers: IncomingHttpHeaders = { 'accept': 'application/json' };
	constructor(body?: any) {
		this.ip = '0.0.0.0';
		this.body = body;
	}
}

type ApiFastifyRequestType = FastifyRequest<{
	Body: {
		username: string;
		password?: string;
		token?: string;
	};
}>;

// JUICE: ログイン失敗時にloginFailed通知・メールが飛ぶこと(SigninApiService.signin()のfail()経路)を検証する。
// SigninWithPasskeyApiService.ts のテストと同じ手法(GlobalModule+CoreModuleを読み込み、副作用のある
// 依存だけを明示的にFakeへ差し替える)を踏襲している。
describe('SigninApiService', () => {
	let app: TestingModule;
	let signinApiService: SigninApiService;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let idService: IdService;
	let notificationService: FakeNotificationService;
	let emailService: FakeEmailService;

	const rawPassword = 'correct-password';
	let passwordHash: string;
	let username: string;

	async function createUser(data: Partial<MiUser> = {}) {
		return await usersRepository.save({ ...data });
	}

	async function createUserProfile(data: Partial<MiUserProfile> = {}) {
		return await userProfilesRepository.save({ ...data });
	}

	beforeAll(async () => {
		passwordHash = await bcrypt.hash(rawPassword, await bcrypt.genSalt(8));

		app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
			providers: [
				SigninApiService,
				{ provide: RateLimiterService, useClass: FakeLimiter },
				{ provide: SigninService, useClass: FakeSigninService },
				{ provide: NotificationService, useClass: FakeNotificationService },
				{ provide: EmailService, useClass: FakeEmailService },
				{ provide: EmailI18nService, useClass: FakeEmailI18nService },
			],
		}).useMocker((token) => {
			if (typeof token === 'function') {
				return mockDeep<typeof token>();
			}
		}).compile();

		signinApiService = app.get<SigninApiService>(SigninApiService);
		usersRepository = app.get<UsersRepository>(DI.usersRepository);
		userProfilesRepository = app.get<UserProfilesRepository>(DI.userProfilesRepository);
		idService = app.get<IdService>(IdService);
		notificationService = app.get<NotificationService>(NotificationService) as unknown as FakeNotificationService;
		emailService = app.get<EmailService>(EmailService) as unknown as FakeEmailService;
	});

	beforeEach(async () => {
		notificationService.createNotification.mockClear();
		emailService.sendEmail.mockClear();

		const uid = idService.gen();
		username = uid;
		const dummyUser = {
			id: uid, username: uid, usernameLower: uid.toLowerCase(), uri: null, host: null, approved: true, isSuspended: false,
		};
		const dummyProfile = {
			userId: uid,
			password: passwordHash,
			email: 'target@example.com',
			emailVerified: true,
		};
		await createUser(dummyUser);
		await createUserProfile(dummyProfile);
	});

	afterAll(async () => {
		await app.close();
	});

	// setImmediateで非同期実行される通知・メール送信の完了を待つ
	async function flushImmediate() {
		await new Promise(resolve => setImmediate(resolve));
	}

	it('パスワードを間違えるとloginFailed通知が飛ぶ', async () => {
		const req = new DummyFastifyRequest({ username, password: 'wrong-password' }) as ApiFastifyRequestType;
		const res = new DummyFastifyReply() as unknown as FastifyReply;
		await signinApiService.signin(req, res);

		expect(res.statusCode).toBe(403);

		await flushImmediate();
		expect(notificationService.createNotification).toHaveBeenCalledWith(username, 'loginFailed', {});
		expect(emailService.sendEmail).toHaveBeenCalled();
	});

	it('確認済みメールアドレスが無い場合はメールを送らない', async () => {
		await userProfilesRepository.update({ userId: username }, { emailVerified: false });

		const req = new DummyFastifyRequest({ username, password: 'wrong-password' }) as ApiFastifyRequestType;
		const res = new DummyFastifyReply() as unknown as FastifyReply;
		await signinApiService.signin(req, res);

		await flushImmediate();
		expect(notificationService.createNotification).toHaveBeenCalledWith(username, 'loginFailed', {});
		expect(emailService.sendEmail).not.toHaveBeenCalled();
	});

	it('パスワードが正しければloginFailed通知は飛ばない', async () => {
		const req = new DummyFastifyRequest({ username, password: rawPassword }) as ApiFastifyRequestType;
		const res = new DummyFastifyReply() as unknown as FastifyReply;
		await signinApiService.signin(req, res);

		await flushImmediate();
		expect(notificationService.createNotification).not.toHaveBeenCalled();
		expect(emailService.sendEmail).not.toHaveBeenCalled();
	});
});
