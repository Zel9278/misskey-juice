/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class JuiceBrandingUrlDefaults1788146674479 {
    name = 'JuiceBrandingUrlDefaults1788146674479';

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/Zel9278/misskey-juice'`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/Zel9278/misskey-juice/issues/new'`);
        await queryRunner.query(`UPDATE "meta" SET "repositoryUrl" = 'https://github.com/Zel9278/misskey-juice' WHERE "repositoryUrl" = 'https://github.com/misskey-dev/misskey'`);
        await queryRunner.query(`UPDATE "meta" SET "feedbackUrl" = 'https://github.com/Zel9278/misskey-juice/issues/new' WHERE "feedbackUrl" = 'https://github.com/misskey-dev/misskey/issues/new'`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/misskey-dev/misskey'`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/misskey-dev/misskey/issues/new'`);
        await queryRunner.query(`UPDATE "meta" SET "repositoryUrl" = 'https://github.com/misskey-dev/misskey' WHERE "repositoryUrl" = 'https://github.com/Zel9278/misskey-juice'`);
        await queryRunner.query(`UPDATE "meta" SET "feedbackUrl" = 'https://github.com/misskey-dev/misskey/issues/new' WHERE "feedbackUrl" = 'https://github.com/Zel9278/misskey-juice/issues/new'`);
    }
};
