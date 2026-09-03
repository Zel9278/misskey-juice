/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class SignupApprovalCheckHistory1788412282462 {
    name = 'SignupApprovalCheckHistory1788412282462'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "signup_approval_check" ADD "username" character varying(128)`);
        await queryRunner.query(`COMMENT ON COLUMN "signup_approval_check"."username" IS 'A snapshot of the applicant username at the time of application, since the user row may be deleted later (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "signup_approval_check" ADD "signupReason" text`);
        await queryRunner.query(`COMMENT ON COLUMN "signup_approval_check"."signupReason" IS 'A snapshot of the applicant-submitted signup reason at the time of application (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "signup_approval_check" ADD "reviewerId" character varying(32)`);
        await queryRunner.query(`COMMENT ON COLUMN "signup_approval_check"."reviewerId" IS 'The ID of the moderator/admin who reviewed this signup application (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "signup_approval_check" ADD "reviewedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE INDEX "IDX_27c2546c121c042dab560255bb" ON "signup_approval_check" ("reviewerId") `);
        await queryRunner.query(`ALTER TABLE "signup_approval_check" ADD CONSTRAINT "FK_27c2546c121c042dab560255bb2" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

        // JUICE: この機能追加より前に作られた行にはusername/signupReasonのスナップショットが無い。
        // 却下済みの行はuser行が既に削除済みで復元できないが、承認済みの行はuser行がまだ生きているため、
        // 現在のuser.username/user.signupReasonから遡って補完しておく(却下時と違い、承認時はuser行を
        // 削除しないため取得できる)。
        await queryRunner.query(`UPDATE "signup_approval_check" c SET "username" = u."username", "signupReason" = u."signupReason" FROM "user" u WHERE c."userId" = u."id" AND c."username" IS NULL`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "signup_approval_check" DROP CONSTRAINT "FK_27c2546c121c042dab560255bb2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_27c2546c121c042dab560255bb"`);
        await queryRunner.query(`ALTER TABLE "signup_approval_check" DROP COLUMN "reviewedAt"`);
        await queryRunner.query(`ALTER TABLE "signup_approval_check" DROP COLUMN "reviewerId"`);
        await queryRunner.query(`ALTER TABLE "signup_approval_check" DROP COLUMN "signupReason"`);
        await queryRunner.query(`ALTER TABLE "signup_approval_check" DROP COLUMN "username"`);
    }
}
