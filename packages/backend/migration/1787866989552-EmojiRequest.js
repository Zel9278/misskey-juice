/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class EmojiRequest1787866989552 {
    name = 'EmojiRequest1787866989552'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "emoji_request" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "fileId" character varying(32), "name" character varying(128) NOT NULL, "category" character varying(128), "license" character varying(1024), "status" character varying(16) NOT NULL DEFAULT 'pending', "rejectReason" text, "reviewerId" character varying(32), "reviewedAt" TIMESTAMP WITH TIME ZONE, "resultEmojiId" character varying(32), "deleteFileAfterReview" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_3c74521e048dc744f0c7eb65f4a" PRIMARY KEY ("id")); COMMENT ON COLUMN "emoji_request"."userId" IS 'The ID of the requester (JUICE).'; COMMENT ON COLUMN "emoji_request"."fileId" IS 'The ID of the attached image file (JUICE).'; COMMENT ON COLUMN "emoji_request"."name" IS 'The requested emoji name (JUICE).'; COMMENT ON COLUMN "emoji_request"."category" IS 'The requested emoji category (JUICE).'; COMMENT ON COLUMN "emoji_request"."license" IS 'The requested emoji license (JUICE).'; COMMENT ON COLUMN "emoji_request"."status" IS 'The status of this request (JUICE): pending, approved, or rejected.'; COMMENT ON COLUMN "emoji_request"."rejectReason" IS 'The reason for rejection, if rejected (JUICE).'; COMMENT ON COLUMN "emoji_request"."reviewerId" IS 'The ID of the moderator/admin who reviewed this request (JUICE).'; COMMENT ON COLUMN "emoji_request"."resultEmojiId" IS 'The ID of the emoji created upon approval (JUICE).'; COMMENT ON COLUMN "emoji_request"."deleteFileAfterReview" IS 'Whether to delete the attached file from the requester''s Drive once this request is reviewed (JUICE).'`);
        await queryRunner.query(`CREATE INDEX "IDX_a4091f9755eb7d8f7a0f44ae28" ON "emoji_request" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c1e4c968b6c866d58090ebbcfc" ON "emoji_request" ("fileId") `);
        await queryRunner.query(`CREATE INDEX "IDX_cd98ccdc71534bd672ce1fa61f" ON "emoji_request" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_d8b23e44adc10ec7fb6f390067" ON "emoji_request" ("reviewerId") `);
        await queryRunner.query(`ALTER TABLE "emoji_request" ADD CONSTRAINT "FK_a4091f9755eb7d8f7a0f44ae284" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "emoji_request" ADD CONSTRAINT "FK_c1e4c968b6c866d58090ebbcfc0" FOREIGN KEY ("fileId") REFERENCES "drive_file"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "emoji_request" ADD CONSTRAINT "FK_d8b23e44adc10ec7fb6f3900673" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "emoji_request" ADD CONSTRAINT "FK_9b3218d935e8fb0ed33431f5750" FOREIGN KEY ("resultEmojiId") REFERENCES "emoji"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "emoji_request" DROP CONSTRAINT "FK_9b3218d935e8fb0ed33431f5750"`);
        await queryRunner.query(`ALTER TABLE "emoji_request" DROP CONSTRAINT "FK_d8b23e44adc10ec7fb6f3900673"`);
        await queryRunner.query(`ALTER TABLE "emoji_request" DROP CONSTRAINT "FK_c1e4c968b6c866d58090ebbcfc0"`);
        await queryRunner.query(`ALTER TABLE "emoji_request" DROP CONSTRAINT "FK_a4091f9755eb7d8f7a0f44ae284"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d8b23e44adc10ec7fb6f390067"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cd98ccdc71534bd672ce1fa61f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c1e4c968b6c866d58090ebbcfc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a4091f9755eb7d8f7a0f44ae28"`);
        await queryRunner.query(`DROP TABLE "emoji_request"`);
    }
}
