/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RelayTimeline1787941081829 {
    name = 'RelayTimeline1787941081829'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ADD "relayId" character varying(32)`);
        await queryRunner.query(`COMMENT ON COLUMN "note"."relayId" IS 'The ID of source relay this note was received from. Null if not relay-delivered (JUICE).'`);
        await queryRunner.query(`CREATE INDEX "IDX_4264791d044e55e58ff966e111" ON "note" ("relayId")`);
        await queryRunner.query(`ALTER TABLE "note" ADD CONSTRAINT "FK_4264791d044e55e58ff966e1113" FOREIGN KEY ("relayId") REFERENCES "relay"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" DROP CONSTRAINT "FK_4264791d044e55e58ff966e1113"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4264791d044e55e58ff966e111"`);
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "relayId"`);
    }
}
