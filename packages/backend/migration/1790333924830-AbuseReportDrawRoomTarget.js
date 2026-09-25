/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: 絵チャの部屋・部屋のチャットの発言を通報の対象にできるようにする
export class AbuseReportDrawRoomTarget1790333924830 {
    name = 'AbuseReportDrawRoomTarget1790333924830'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "abuse_user_report" ADD "targetDrawRoomId" character varying(32)`);
        await queryRunner.query(`COMMENT ON COLUMN "abuse_user_report"."targetDrawRoomId" IS 'Reported drawing chat room. Not a foreign key so the report is kept after the room is deleted (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" ADD "targetDrawRoomSnapshot" jsonb`);
        await queryRunner.query(`COMMENT ON COLUMN "abuse_user_report"."targetDrawRoomSnapshot" IS 'Snapshot of the reported drawing chat room (and chat message) at the time of the report (JUICE).'`);
        await queryRunner.query(`COMMENT ON COLUMN "abuse_user_report"."targetType" IS 'Report target content type: note | chatMessage | drawRoom | drawRoomChat | null (user only) (JUICE).'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`COMMENT ON COLUMN "abuse_user_report"."targetType" IS 'Report target content type: note | chatMessage | null (user only) (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" DROP COLUMN "targetDrawRoomSnapshot"`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" DROP COLUMN "targetDrawRoomId"`);
    }
}
