/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ContactForm1788598121775 {
    name = 'ContactForm1788598121775'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TYPE "public"."contact_form_replymethod_enum" AS ENUM('email', 'misskey')`);
        await queryRunner.query(`CREATE TYPE "public"."contact_form_status_enum" AS ENUM('pending', 'in_progress', 'resolved', 'closed')`);
        await queryRunner.query(`CREATE TABLE "contact_form" ("id" character varying(32) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE, "subject" character varying(256) NOT NULL, "content" text NOT NULL, "replyMethod" "public"."contact_form_replymethod_enum" NOT NULL, "name" character varying(256), "email" character varying(320), "misskeyUsername" character varying(128), "category" character varying(64) NOT NULL DEFAULT 'other', "status" "public"."contact_form_status_enum" NOT NULL DEFAULT 'pending', "adminNote" text, "ipAddress" character varying(45), "userAgent" character varying(1024), "userId" character varying(32), "assignedUserId" character varying(32), "assignedNickname" character varying(128), CONSTRAINT "PK_1f26699518c7f6f08fa91c84e13" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f3c94f9edbbf7a315a18c63d17" ON "contact_form" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_bab1f8403b91a33657bce64e1c" ON "contact_form" ("replyMethod") `);
        await queryRunner.query(`CREATE INDEX "IDX_17a7fc086ef9872ad96f77cd26" ON "contact_form" ("category") `);
        await queryRunner.query(`CREATE INDEX "IDX_79f035a87e63f6f92b1c7178f9" ON "contact_form" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_7cc21033a9fda777b081304701" ON "contact_form" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_6aa31fdf15b641785e268f6d1c" ON "contact_form" ("assignedUserId") `);
        await queryRunner.query(`ALTER TABLE "contact_form" ADD CONSTRAINT "FK_7cc21033a9fda777b081304701e" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contact_form" ADD CONSTRAINT "FK_6aa31fdf15b641785e268f6d1c6" FOREIGN KEY ("assignedUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "contact_form" DROP CONSTRAINT "FK_6aa31fdf15b641785e268f6d1c6"`);
        await queryRunner.query(`ALTER TABLE "contact_form" DROP CONSTRAINT "FK_7cc21033a9fda777b081304701e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6aa31fdf15b641785e268f6d1c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7cc21033a9fda777b081304701"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_79f035a87e63f6f92b1c7178f9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_17a7fc086ef9872ad96f77cd26"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bab1f8403b91a33657bce64e1c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f3c94f9edbbf7a315a18c63d17"`);
        await queryRunner.query(`DROP TABLE "contact_form"`);
        await queryRunner.query(`DROP TYPE "public"."contact_form_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."contact_form_replymethod_enum"`);
    }
}
