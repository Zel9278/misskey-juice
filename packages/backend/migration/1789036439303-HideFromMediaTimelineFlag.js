/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class HideFromMediaTimelineFlag1789036439303 {
    name = 'HideFromMediaTimelineFlag1789036439303'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ADD "hideFromMediaTimeline" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "note"."hideFromMediaTimeline" IS 'Whether this note should be excluded from the media timeline (withFiles-filtered timelines) (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "note_draft" ADD "hideFromMediaTimeline" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "note_draft"."hideFromMediaTimeline" IS 'Whether this note draft should be excluded from the media timeline (withFiles-filtered timelines) (JUICE).'`);
        await queryRunner.query(`CREATE INDEX "IDX_1f07cfd783166db4789a42de2c" ON "note" ("hideFromMediaTimeline")`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_1f07cfd783166db4789a42de2c"`);
        await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN "hideFromMediaTimeline"`);
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "hideFromMediaTimeline"`);
    }
}
