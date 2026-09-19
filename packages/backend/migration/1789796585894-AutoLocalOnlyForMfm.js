/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AutoLocalOnlyForMfm1789796585894 {
    name = 'AutoLocalOnlyForMfm1789796585894'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "autoLocalOnlyForMarkdownMfm" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."autoLocalOnlyForMarkdownMfm" IS 'Automatically make notes local-only when they contain standard Markdown-style decoration (bold/italic/strikethrough/code), checked separately from MFM-only decoration (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "autoLocalOnlyForFnMfm" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."autoLocalOnlyForFnMfm" IS 'Automatically make notes local-only when they contain MFM-only decoration (center/small/quote/search/math/fn functions), checked separately from standard Markdown-style decoration (JUICE).'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "autoLocalOnlyForFnMfm"`);
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "autoLocalOnlyForMarkdownMfm"`);
    }
}
