/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class EmailLang1787693047054 {
    name = 'EmailLang1787693047054'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "emailLang" character varying(32)`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."emailLang" IS 'The language used for system emails sent to this user (JUICE). Falls back to the instance default when null.'`);
        await queryRunner.query(`ALTER TABLE "user_pending" ADD "emailLang" character varying(32)`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_pending" DROP COLUMN "emailLang"`);
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "emailLang"`);
    }
}
