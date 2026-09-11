/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AbuseReportCategoryAndTarget1789124152125 {
    name = 'AbuseReportCategoryAndTarget1789124152125'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "abuse_user_report" ADD "category" character varying(64)`);
        await queryRunner.query(`COMMENT ON COLUMN "abuse_user_report"."category" IS 'Report category key, references admin-configured reportCategories (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" ADD "targetType" character varying(32)`);
        await queryRunner.query(`COMMENT ON COLUMN "abuse_user_report"."targetType" IS 'Report target content type: note | chatMessage | null (user only) (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" ADD "targetNoteId" character varying(32)`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" ADD "targetChatMessageId" character varying(32)`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" ADD CONSTRAINT "FK_aab2f060d1bdcab13ade80acf9c" FOREIGN KEY ("targetNoteId") REFERENCES "note"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" ADD CONSTRAINT "FK_50291a7b4fd7d6dcac7f2491a39" FOREIGN KEY ("targetChatMessageId") REFERENCES "chat_message"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "abuse_user_report" DROP CONSTRAINT "FK_50291a7b4fd7d6dcac7f2491a39"`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" DROP CONSTRAINT "FK_aab2f060d1bdcab13ade80acf9c"`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" DROP COLUMN "targetChatMessageId"`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" DROP COLUMN "targetNoteId"`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" DROP COLUMN "targetType"`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" DROP COLUMN "category"`);
    }
}
