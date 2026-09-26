/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: リポジトリをmisskey-juice組織へ移したのに合わせて、既定のリポジトリURL・フィードバックURLを移行先に変える。
// 管理者が別のURLにしているサーバーはそのまま(旧URLのままのものだけ書き換える)
export class JuiceOrgRepositoryUrl1790414874298 {
    name = 'JuiceOrgRepositoryUrl1790414874298';

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/misskey-juice/misskey-juice'`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/misskey-juice/misskey-juice/issues/new'`);
        await queryRunner.query(`UPDATE "meta" SET "repositoryUrl" = 'https://github.com/misskey-juice/misskey-juice' WHERE "repositoryUrl" = 'https://github.com/Zel9278/misskey-juice'`);
        await queryRunner.query(`UPDATE "meta" SET "feedbackUrl" = 'https://github.com/misskey-juice/misskey-juice/issues/new' WHERE "feedbackUrl" = 'https://github.com/Zel9278/misskey-juice/issues/new'`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/Zel9278/misskey-juice'`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/Zel9278/misskey-juice/issues/new'`);
        await queryRunner.query(`UPDATE "meta" SET "repositoryUrl" = 'https://github.com/Zel9278/misskey-juice' WHERE "repositoryUrl" = 'https://github.com/misskey-juice/misskey-juice'`);
        await queryRunner.query(`UPDATE "meta" SET "feedbackUrl" = 'https://github.com/Zel9278/misskey-juice/issues/new' WHERE "feedbackUrl" = 'https://github.com/misskey-juice/misskey-juice/issues/new'`);
    }
};
