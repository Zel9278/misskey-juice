/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddAnnouncementPoll1788022811480 {
    name = 'AddAnnouncementPoll1788022811480'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "announcement_poll" ("announcementId" character varying(32) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE, "multiple" boolean NOT NULL, "choices" character varying(256) array NOT NULL DEFAULT '{}', "votes" integer array NOT NULL, CONSTRAINT "PK_c94d252fdb90599cd9d81a57579" PRIMARY KEY ("announcementId"))`);
        await queryRunner.query(`CREATE TABLE "announcement_poll_vote" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "announcementId" character varying(32) NOT NULL, "choice" integer NOT NULL, CONSTRAINT "PK_6db305c553c8a8a6ee07f807b9a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ff05365b8cbae9a3fd03d503a3" ON "announcement_poll_vote"  ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_a12fce85b9879c31c91a598483" ON "announcement_poll_vote"  ("announcementId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_924777687ec44c388c825a8849" ON "announcement_poll_vote"  ("userId", "announcementId", "choice") `);
        await queryRunner.query(`ALTER TABLE "announcement_poll" ADD CONSTRAINT "FK_c94d252fdb90599cd9d81a57579" FOREIGN KEY ("announcementId") REFERENCES "announcement"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "announcement_poll_vote" ADD CONSTRAINT "FK_ff05365b8cbae9a3fd03d503a34" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "announcement_poll_vote" ADD CONSTRAINT "FK_a12fce85b9879c31c91a5984832" FOREIGN KEY ("announcementId") REFERENCES "announcement"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "announcement_poll_vote" DROP CONSTRAINT "FK_a12fce85b9879c31c91a5984832"`);
        await queryRunner.query(`ALTER TABLE "announcement_poll_vote" DROP CONSTRAINT "FK_ff05365b8cbae9a3fd03d503a34"`);
        await queryRunner.query(`ALTER TABLE "announcement_poll" DROP CONSTRAINT "FK_c94d252fdb90599cd9d81a57579"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_924777687ec44c388c825a8849"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a12fce85b9879c31c91a598483"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ff05365b8cbae9a3fd03d503a3"`);
        await queryRunner.query(`DROP TABLE "announcement_poll_vote"`);
        await queryRunner.query(`DROP TABLE "announcement_poll"`);
    }
}
