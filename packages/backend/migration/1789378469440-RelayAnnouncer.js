/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RelayAnnouncer1789378469440 {
    name = 'RelayAnnouncer1789378469440'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ADD "relayAnnouncerId" character varying(32)`);
        await queryRunner.query(`COMMENT ON COLUMN "note"."relayAnnouncerId" IS 'The ID of the user (relay subscriber) whose Announce caused this note to be tagged with relayId (JUICE).'`);
        await queryRunner.query(`CREATE INDEX "IDX_ebd9dcb9460a4d79ab159f3a6a" ON "note" ("relayAnnouncerId")`);
        await queryRunner.query(`ALTER TABLE "note" ADD CONSTRAINT "FK_ebd9dcb9460a4d79ab159f3a6a5" FOREIGN KEY ("relayAnnouncerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" DROP CONSTRAINT "FK_ebd9dcb9460a4d79ab159f3a6a5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ebd9dcb9460a4d79ab159f3a6a"`);
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "relayAnnouncerId"`);
    }
}
