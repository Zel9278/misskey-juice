/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AvatarDecorationRequest1788215624373 {
    name = 'AvatarDecorationRequest1788215624373'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "avatar_decoration_request" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "fileId" character varying(32), "name" character varying(256) NOT NULL, "description" character varying(2048) NOT NULL, "category" character varying(128), "status" character varying(16) NOT NULL DEFAULT 'pending', "rejectReason" text, "reviewerId" character varying(32), "reviewedAt" TIMESTAMP WITH TIME ZONE, "resultAvatarDecorationId" character varying(32), "deleteFileAfterReview" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_969225838ce8038cc8eaae85a52" PRIMARY KEY ("id")); COMMENT ON COLUMN "avatar_decoration_request"."userId" IS 'The ID of the requester (JUICE).'; COMMENT ON COLUMN "avatar_decoration_request"."fileId" IS 'The ID of the attached image file (JUICE).'; COMMENT ON COLUMN "avatar_decoration_request"."name" IS 'The requested avatar decoration name (JUICE).'; COMMENT ON COLUMN "avatar_decoration_request"."description" IS 'The requested avatar decoration description (JUICE).'; COMMENT ON COLUMN "avatar_decoration_request"."category" IS 'The requested avatar decoration category (JUICE).'; COMMENT ON COLUMN "avatar_decoration_request"."status" IS 'The status of this request (JUICE): pending, approved, or rejected.'; COMMENT ON COLUMN "avatar_decoration_request"."rejectReason" IS 'The reason for rejection, if rejected (JUICE).'; COMMENT ON COLUMN "avatar_decoration_request"."reviewerId" IS 'The ID of the moderator/admin who reviewed this request (JUICE).'; COMMENT ON COLUMN "avatar_decoration_request"."resultAvatarDecorationId" IS 'The ID of the avatar decoration created upon approval (JUICE).'; COMMENT ON COLUMN "avatar_decoration_request"."deleteFileAfterReview" IS 'Whether to delete the attached file from the requester''s Drive once this request is reviewed (JUICE).'`);
        await queryRunner.query(`CREATE INDEX "IDX_9fd056d8bb354269ce0bfeb502" ON "avatar_decoration_request" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_acda4733d98a163a354914efaa" ON "avatar_decoration_request" ("fileId") `);
        await queryRunner.query(`CREATE INDEX "IDX_4e0dac12a234ee2781569fa726" ON "avatar_decoration_request" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_139b70b0611053500b46ad9585" ON "avatar_decoration_request" ("reviewerId") `);
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "receiveAvatarDecorationRequestResultEmail" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."receiveAvatarDecorationRequestResultEmail" IS 'Whether to receive an email when own avatar decoration request is approved/rejected (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "avatar_decoration_request" ADD CONSTRAINT "FK_9fd056d8bb354269ce0bfeb5026" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "avatar_decoration_request" ADD CONSTRAINT "FK_acda4733d98a163a354914efaa3" FOREIGN KEY ("fileId") REFERENCES "drive_file"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "avatar_decoration_request" ADD CONSTRAINT "FK_139b70b0611053500b46ad95850" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "avatar_decoration_request" ADD CONSTRAINT "FK_e47c4f11cc14ea5cc90cb9133fd" FOREIGN KEY ("resultAvatarDecorationId") REFERENCES "avatar_decoration"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "avatar_decoration_request" DROP CONSTRAINT "FK_e47c4f11cc14ea5cc90cb9133fd"`);
        await queryRunner.query(`ALTER TABLE "avatar_decoration_request" DROP CONSTRAINT "FK_139b70b0611053500b46ad95850"`);
        await queryRunner.query(`ALTER TABLE "avatar_decoration_request" DROP CONSTRAINT "FK_acda4733d98a163a354914efaa3"`);
        await queryRunner.query(`ALTER TABLE "avatar_decoration_request" DROP CONSTRAINT "FK_9fd056d8bb354269ce0bfeb5026"`);
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "receiveAvatarDecorationRequestResultEmail"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_139b70b0611053500b46ad9585"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4e0dac12a234ee2781569fa726"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_acda4733d98a163a354914efaa"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9fd056d8bb354269ce0bfeb502"`);
        await queryRunner.query(`DROP TABLE "avatar_decoration_request"`);
    }
}
