/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AbuseReportSituationDetail1789131177799 {
    name = 'AbuseReportSituationDetail1789131177799'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "abuse_user_report" ADD "situationDetail" character varying(2048)`);
        await queryRunner.query(`COMMENT ON COLUMN "abuse_user_report"."situationDetail" IS 'Reporter-provided description of the situation/circumstances (JUICE).'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "abuse_user_report" DROP COLUMN "situationDetail"`);
    }
}
