/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DriveFileNovelFlag1790242317936 {
    name = 'DriveFileNovelFlag1790242317936'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "drive_file" ADD "isNovel" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "drive_file"."isNovel" IS 'Whether the DriveFile (a .txt file) is flagged as a novel/long-form fiction text (JUICE).'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "drive_file" DROP COLUMN "isNovel"`);
    }
}
