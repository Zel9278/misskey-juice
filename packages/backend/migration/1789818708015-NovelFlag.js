/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NovelFlag1789818708015 {
    name = 'NovelFlag1789818708015'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ADD "isNovel" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "note"."isNovel" IS 'Whether this note is flagged as a novel/long-form fiction post (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "note_draft" ADD "isNovel" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "note_draft"."isNovel" IS 'Whether this note draft is flagged as a novel/long-form fiction post (JUICE).'`);
        await queryRunner.query(`CREATE INDEX "IDX_a58c528bf5a3b24bdae66a7e20" ON "note" ("isNovel")`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_a58c528bf5a3b24bdae66a7e20"`);
        await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN "isNovel"`);
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "isNovel"`);
    }
}
