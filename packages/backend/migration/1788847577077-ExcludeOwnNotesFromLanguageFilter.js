/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ExcludeOwnNotesFromLanguageFilter1788847577077 {
    name = 'ExcludeOwnNotesFromLanguageFilter1788847577077'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "excludeOwnNotesFromLanguageFilter" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."excludeOwnNotesFromLanguageFilter" IS 'Whether to always show the user''s own notes regardless of filteredLanguages (JUICE).'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "excludeOwnNotesFromLanguageFilter"`);
    }
}
