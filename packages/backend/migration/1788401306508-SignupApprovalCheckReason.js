/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class SignupApprovalCheckReason1788401306508 {
    name = 'SignupApprovalCheckReason1788401306508'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "signup_approval_check" ADD "reason" text`);
        await queryRunner.query(`COMMENT ON COLUMN "signup_approval_check"."reason" IS 'The reason for declining this signup application, if declined (JUICE).'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "signup_approval_check" DROP COLUMN "reason"`);
    }
}
