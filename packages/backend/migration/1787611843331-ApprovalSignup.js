/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ApprovalSignup1787611843331 {
    name = 'ApprovalSignup1787611843331'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ADD "approved" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."approved" IS 'Whether the User is approved (used when approval-required signup is enabled).'`);
        await queryRunner.query(`ALTER TABLE "user" ADD "signupReason" text`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."signupReason" IS 'The reason the User gave at signup, when approval-required signup was enabled. Moderator/admin only.'`);
        await queryRunner.query(`ALTER TABLE "user_pending" ADD "reason" text`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_pending" DROP COLUMN "reason"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "signupReason"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "approved"`);
    }
}
