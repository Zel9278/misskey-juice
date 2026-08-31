/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IncomingHttpHeaders } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
	let notificationService: NotificationService;
	let emailService: EmailService;
	let createNotificationSpy: ReturnType<typeof vi.spyOn>;
	let sendEmailSpy: ReturnType<typeof vi.spyOn>;

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
		// JUICE: NotificationService/EmailServiceはCoreModuleが提供する実インスタンスを取得し、
		// SigninWithPasskeyApiService.tsのテストのwebAuthnServiceと同じくvi.spyOnでメソッドだけ
		// 差し替える(useClassでのprovider上書きはCoreModule経由の依存関係では効かなかったため)。
		// EmailI18nServiceは副作用が無いテンプレート整形だけなので実インスタンスのまま使う。
		notificationService = app.get<NotificationService>(NotificationService);
		emailService = app.get<EmailService>(EmailService);
	});

	beforeEach(async () => {
		createNotificationSpy = vi.spyOn(notificationService, 'createNotification').mockImplementation(() => {});
		sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockImplementation(async () => {});

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

	afterEach(() => {
		vi.restoreAllMocks();
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

		// EmailI18nServiceは実インスタンスなので、resolveLang()が実際にDBへ問い合わせる分の
		// 遅延がある。setImmediateを1回挟むだけでは足りないことがあるため、両方の呼び出しが
		// 揃うまでポーリングする(そうしないと、このテストの完了を待たずに次のテストへ進んでしまい、
		// 遅れて発火したsendEmail呼び出しが次のテストのspyに誤って記録されることがある)
		await vi.waitFor(() => {
			expect(createNotificationSpy).toHaveBeenCalledWith(username, 'loginFailed', {});
			expect(sendEmailSpy).toHaveBeenCalled();
		});
	});

	it('確認済みメールアドレスが無い場合はメールを送らない', async () => {
		await userProfilesRepository.update({ userId: username }, { emailVerified: false });

		const req = new DummyFastifyRequest({ username, password: 'wrong-password' }) as ApiFastifyRequestType;
		const res = new DummyFastifyReply() as unknown as FastifyReply;
		await signinApiService.signin(req, res);

		// createNotificationはメール送信可否のチェックより前で同期的に呼ばれるため、これが
		// 呼ばれた時点でfail()内の処理はメール送信の分岐まで到達している(emailVerified: falseなので
		// そのままメール送信をスキップして完了する経路)
		await vi.waitFor(() => {
			expect(createNotificationSpy).toHaveBeenCalledWith(username, 'loginFailed', {});
		});
		expect(sendEmailSpy).not.toHaveBeenCalled();
	});

	it('パスワードが正しければloginFailed通知は飛ばない', async () => {
		const req = new DummyFastifyRequest({ username, password: rawPassword }) as ApiFastifyRequestType;
		const res = new DummyFastifyReply() as unknown as FastifyReply;
		await signinApiService.signin(req, res);

		await flushImmediate();
		expect(createNotificationSpy).not.toHaveBeenCalled();
		expect(sendEmailSpy).not.toHaveBeenCalled();
	});

	it('承認待ちアカウントはパスワードが正しい場合のみ403(承認待ち)が返る', async () => {
		await usersRepository.update({ id: username }, { approved: false });

		const req = new DummyFastifyRequest({ username, password: rawPassword }) as ApiFastifyRequestType;
		const res = new DummyFastifyReply() as unknown as FastifyReply;
		const result = await signinApiService.signin(req, res);

		expect(res.statusCode).toBe(403);
		expect((result as { error: { id: string } }).error.id).toBe('9f2f084b-af33-4f06-93cf-8a7fe04c6786');
	});

	it('承認待ちアカウントでもパスワードが違えば通常の失敗エラーになる(状態列挙防止)', async () => {
		await usersRepository.update({ id: username }, { approved: false });

		const req = new DummyFastifyRequest({ username, password: 'wrong-password' }) as ApiFastifyRequestType;
		const res = new DummyFastifyReply() as unknown as FastifyReply;
		const result = await signinApiService.signin(req, res);

		expect(res.statusCode).toBe(403);
		expect((result as { error: { id: string } }).error.id).toBe('932c904e-9460-45b7-9ce6-7ed33be7eb2c');

		// fail()経路の非同期処理の完了を待機(次テストのspyへの混入防止)
		await vi.waitFor(() => {
			expect(createNotificationSpy).toHaveBeenCalledWith(username, 'loginFailed', {});
		});
	});
});
