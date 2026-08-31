/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AIGeneratedFlag1787816080310 {
    name = 'AIGeneratedFlag1787816080310'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ADD "isAIGenerated" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "note"."isAIGenerated" IS 'Whether this note is flagged as AI-generated content (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "note_draft" ADD "isAIGenerated" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "note_draft"."isAIGenerated" IS 'Whether this note draft is flagged as AI-generated content (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "drive_file" ADD "isAIGenerated" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "drive_file"."isAIGenerated" IS 'Whether the DriveFile is flagged as AI-generated content (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "muteAIGeneratedNotes" character varying(16) NOT NULL DEFAULT 'none'`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."muteAIGeneratedNotes" IS 'How to treat notes flagged as AI-generated (JUICE): none, mute (collapse), or hardMute (fully hide).'`);
        await queryRunner.query(`CREATE INDEX "IDX_8e9ad466e406267224740f3c28" ON "note" ("isAIGenerated")`);
        await queryRunner.query(`CREATE INDEX "IDX_180e8fc1b64d3a131c01753bc2" ON "drive_file" ("isAIGenerated")`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_180e8fc1b64d3a131c01753bc2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8e9ad466e406267224740f3c28"`);
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "muteAIGeneratedNotes"`);
        await queryRunner.query(`ALTER TABLE "drive_file" DROP COLUMN "isAIGenerated"`);
        await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN "isAIGenerated"`);
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "isAIGenerated"`);
    }
}
