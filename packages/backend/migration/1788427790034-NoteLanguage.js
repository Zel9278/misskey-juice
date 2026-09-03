/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NoteLanguage1788427790034 {
    name = 'NoteLanguage1788427790034'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "filteredLanguages" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."filteredLanguages" IS 'List of languages (BCP 47) to show in timelines. Empty means no filtering (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "note" ADD "lang" character varying(32)`);
        await queryRunner.query(`CREATE INDEX "IDX_f5c23fce09a70c9851d6c56a32" ON "note" ("lang")`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_f5c23fce09a70c9851d6c56a32"`);
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "lang"`);
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "filteredLanguages"`);
    }
}
