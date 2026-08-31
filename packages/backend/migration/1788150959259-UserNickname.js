/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserNickname1788150959259 {
    name = 'UserNickname1788150959259'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "user_nickname" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "targetUserId" character varying(32) NOT NULL, "nickname" character varying(128) NOT NULL, CONSTRAINT "PK_c1791e55956a45522352583c843" PRIMARY KEY ("id")); COMMENT ON COLUMN "user_nickname"."userId" IS 'The ID of author.'; COMMENT ON COLUMN "user_nickname"."targetUserId" IS 'The ID of target user.'; COMMENT ON COLUMN "user_nickname"."nickname" IS 'Nickname.'`);
        await queryRunner.query(`CREATE INDEX "IDX_eb9108e93fb70e1138503d7d0b" ON "user_nickname" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_ac31993aac993bbfa9cdd84b75" ON "user_nickname" ("targetUserId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e4a51d67d52a8af0c1b0525a76" ON "user_nickname" ("userId", "targetUserId") `);
        await queryRunner.query(`ALTER TABLE "user_nickname" ADD CONSTRAINT "FK_eb9108e93fb70e1138503d7d0b0" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_nickname" ADD CONSTRAINT "FK_ac31993aac993bbfa9cdd84b750" FOREIGN KEY ("targetUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_nickname" DROP CONSTRAINT "FK_ac31993aac993bbfa9cdd84b750"`);
        await queryRunner.query(`ALTER TABLE "user_nickname" DROP CONSTRAINT "FK_eb9108e93fb70e1138503d7d0b0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e4a51d67d52a8af0c1b0525a76"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ac31993aac993bbfa9cdd84b75"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_eb9108e93fb70e1138503d7d0b"`);
        await queryRunner.query(`DROP TABLE "user_nickname"`);
    }
}
