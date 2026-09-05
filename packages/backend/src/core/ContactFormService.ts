/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { ContactFormsRepository } from '@/models/_.js';
import type { MiContactForm } from '@/models/ContactForm.js';
import { bindThis } from '@/decorators.js';
import { SystemWebhookService, ContactFormPayload } from '@/core/SystemWebhookService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import { JuiceSettingsService } from '@/core/JuiceSettingsService.js';
import { resolveContactFormSettings, ContactFormCategory } from '@/models/JuiceSettings.js';

// JUICE: misskey-tempuraのコンタクトフォームを参考に追加
export type ContactFormUpdateData = {
	status?: 'pending' | 'in_progress' | 'resolved' | 'closed';
	adminNote?: string;
	assignedUserId?: string | null;
	assignedNickname?: string | null;
};

export type ContactFormSubmitData = {
	subject: string;
	content: string;
	replyMethod: 'email' | 'misskey';
	name?: string | null;
	email?: string | null;
	misskeyUsername?: string | null;
	category?: string;
	ipAddress?: string | null;
	userAgent?: string | null;
	userId?: string | null;
};

@Injectable()
export class ContactFormService {
	constructor(
		@Inject(DI.contactFormsRepository)
		private contactFormsRepository: ContactFormsRepository,

		private systemWebhookService: SystemWebhookService,
		private userEntityService: UserEntityService,
		private idService: IdService,
		private juiceSettingsService: JuiceSettingsService,
	) {
	}

	@bindThis
	public async getEnabledCategories(): Promise<ContactFormCategory[]> {
		const { contactFormCategories } = resolveContactFormSettings(await this.juiceSettingsService.fetch());
		return contactFormCategories
			.filter(cat => cat.enabled)
			.sort((a, b) => a.order - b.order);
	}

	@bindThis
	public async getDefaultCategory(): Promise<string> {
		const categories = await this.getEnabledCategories();
		const defaultCategory = categories.find(cat => cat.isDefault);
		return defaultCategory ? defaultCategory.key : 'other';
	}

	@bindThis
	public async validateCategory(category: string): Promise<boolean> {
		const enabledCategories = await this.getEnabledCategories();
		return enabledCategories.some(cat => cat.key === category);
	}

	@bindThis
	public async show(contactFormId: string): Promise<MiContactForm | null> {
		return this.contactFormsRepository.findOne({
			where: { id: contactFormId },
			relations: { user: true, assignedUser: true },
		});
	}

	@bindThis
	public async update(contactFormId: string, data: ContactFormUpdateData): Promise<void> {
		const updateData: Partial<MiContactForm> = {};

		if (data.status !== undefined) {
			updateData.status = data.status;
		}

		if (data.adminNote !== undefined) {
			updateData.adminNote = data.adminNote;
		}

		if (data.assignedUserId !== undefined) {
			updateData.assignedUserId = data.assignedUserId;
		}

		if (data.assignedNickname !== undefined) {
			updateData.assignedNickname = data.assignedNickname;
		}

		updateData.updatedAt = new Date();

		await this.contactFormsRepository.update(contactFormId, updateData);
	}

	@bindThis
	public async delete(contactFormId: string): Promise<void> {
		await this.contactFormsRepository.delete(contactFormId);
	}

	@bindThis
	public async notifyContactFormReceived(contactForm: MiContactForm): Promise<void> {
		const payload: ContactFormPayload = {
			id: contactForm.id,
			subject: contactForm.subject,
			content: contactForm.content,
			name: contactForm.name,
			email: contactForm.email,
			misskeyUsername: contactForm.misskeyUsername,
			replyMethod: contactForm.replyMethod,
			category: contactForm.category,
			status: contactForm.status,
			ipAddress: contactForm.ipAddress,
			userAgent: contactForm.userAgent,
			user: contactForm.user ? await this.userEntityService.pack(contactForm.user, undefined, { schema: 'UserLite' }) : null,
		};

		await this.systemWebhookService.enqueueSystemWebhook('receivedContactForm', payload);
	}

	@bindThis
	public async submit(data: ContactFormSubmitData): Promise<MiContactForm> {
		// JUICE: カテゴリの妥当性検証は呼び出し元のendpoint(contact-form/submit.ts)で完了済みの前提
		const category = data.category || await this.getDefaultCategory();

		const contactForm = await this.contactFormsRepository.insertOne({
			id: this.idService.gen(),
			createdAt: new Date(),
			subject: data.subject.trim(),
			content: data.content.trim(),
			replyMethod: data.replyMethod,
			name: data.name?.trim() || null,
			email: data.email?.trim() || null,
			misskeyUsername: data.misskeyUsername?.trim() || null,
			category: category,
			status: 'pending',
			ipAddress: data.ipAddress,
			// JUICE: userAgentカラムはvarchar(1024)のため、リクエストヘッダーの値をそのまま入れると
			// 長大なUser-Agentを送るクライアントで挿入エラーになる。安全側に切り詰める
			userAgent: data.userAgent?.slice(0, 1024) ?? null,
			userId: data.userId ?? null,
		});

		await this.notifyContactFormReceived(contactForm);

		return contactForm;
	}
}
