/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, JoinColumn, Column, OneToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiAnnouncement } from './Announcement.js';

@Entity('announcement_poll')
export class MiAnnouncementPoll {
	@PrimaryColumn(id())
	public announcementId: MiAnnouncement['id'];

	@OneToOne(() => MiAnnouncement, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public announcement: MiAnnouncement | null;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public expiresAt: Date | null;

	@Column('boolean')
	public multiple: boolean;

	@Column('varchar', {
		length: 256, array: true, default: '{}',
	})
	public choices: string[];

	@Column('integer', {
		array: true,
	})
	public votes: number[];

	constructor(data: Partial<MiAnnouncementPoll>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}

export type IAnnouncementPoll = {
	choices: string[];
	votes?: number[];
	multiple: boolean;
	expiresAt: Date | null;
};
