/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class SignupApprovalCheck1787972535757 {
    name = 'SignupApprovalCheck1787972535757'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "signup_approval_check" ("id" character varying(32) NOT NULL, "code" character varying(64) NOT NULL, "userId" character varying(32), "status" character varying(16) NOT NULL DEFAULT 'pending', CONSTRAINT "PK_85fa469d265c6c5aa5322e92468" PRIMARY KEY ("id")); COMMENT ON COLUMN "signup_approval_check"."code" IS 'The secret code given to the applicant to check their approval status (JUICE).'; COMMENT ON COLUMN "signup_approval_check"."status" IS 'The approval status of this signup application (JUICE): pending, approved, or declined.'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f01a6db6a5912378d75c384bd2" ON "signup_approval_check" ("code") `);
        await queryRunner.query(`CREATE INDEX "IDX_a07a5d85770541ff7c5a465e01" ON "signup_approval_check" ("userId") `);
        await queryRunner.query(`ALTER TABLE "signup_approval_check" ADD CONSTRAINT "FK_a07a5d85770541ff7c5a465e01b" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "signup_approval_check" DROP CONSTRAINT "FK_a07a5d85770541ff7c5a465e01b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a07a5d85770541ff7c5a465e01"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f01a6db6a5912378d75c384bd2"`);
        await queryRunner.query(`DROP TABLE "signup_approval_check"`);
    }
}
