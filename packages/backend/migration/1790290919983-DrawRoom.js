/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: 絵チャ(お絵かきチャット)の部屋・メンバー・保存されたレイヤー
export class DrawRoom1790290919983 {
    name = 'DrawRoom1790290919983'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "draw_room" ("id" character varying(32) NOT NULL, "ownerId" character varying(32) NOT NULL, "title" character varying(64) NOT NULL, "visibility" character varying(16) NOT NULL, "maxMembers" integer NOT NULL, "canvasWidth" integer NOT NULL, "canvasHeight" integer NOT NULL, "keepAfterEnd" boolean NOT NULL DEFAULT false, "isEnded" boolean NOT NULL DEFAULT false, "endedAt" TIMESTAMP WITH TIME ZONE, "chatLog" jsonb NOT NULL DEFAULT '[]', CONSTRAINT "PK_bdc16b77cc5476e276720e12710" PRIMARY KEY ("id")); COMMENT ON COLUMN "draw_room"."visibility" IS 'Who can see and join the room: followers of the owner, or all local users (JUICE).'; COMMENT ON COLUMN "draw_room"."maxMembers" IS 'Maximum number of members who can draw (spectators are not counted) (JUICE).'; COMMENT ON COLUMN "draw_room"."keepAfterEnd" IS 'Whether to keep the drawing on the server after the room ends (JUICE).'; COMMENT ON COLUMN "draw_room"."chatLog" IS 'Chat messages saved when a kept room ends (JUICE).'`);
        await queryRunner.query(`CREATE INDEX "IDX_daf724b21a05462e14c444ce91" ON "draw_room"  ("ownerId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f5ee2da032bfe82eecf8a6c86e" ON "draw_room"  ("isEnded") `);
        await queryRunner.query(`CREATE TABLE "draw_room_member" ("id" character varying(32) NOT NULL, "roomId" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, CONSTRAINT "PK_ee2164c28cf11a9ef869866fac0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_30f70eed1856df5098b09ad0b3" ON "draw_room_member"  ("roomId") `);
        await queryRunner.query(`CREATE INDEX "IDX_0df34a4fcd18123db0fba13b93" ON "draw_room_member"  ("userId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e8af7eea910660b78752d32ecf" ON "draw_room_member"  ("roomId", "userId") `);
        await queryRunner.query(`CREATE TABLE "draw_room_layer" ("id" character varying(32) NOT NULL, "roomId" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "strokes" jsonb NOT NULL DEFAULT '[]', CONSTRAINT "PK_f0e4d0d2336fcd61777df318b78" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1545cfdad55ee722e6ad44b7c3" ON "draw_room_layer"  ("roomId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5c1b8b0e5a8a6a10fbdc5eb674" ON "draw_room_layer"  ("roomId", "userId") `);
        await queryRunner.query(`ALTER TABLE "draw_room" ADD CONSTRAINT "FK_daf724b21a05462e14c444ce912" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "draw_room_member" ADD CONSTRAINT "FK_30f70eed1856df5098b09ad0b30" FOREIGN KEY ("roomId") REFERENCES "draw_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "draw_room_member" ADD CONSTRAINT "FK_0df34a4fcd18123db0fba13b935" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "draw_room_layer" ADD CONSTRAINT "FK_1545cfdad55ee722e6ad44b7c39" FOREIGN KEY ("roomId") REFERENCES "draw_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "draw_room_layer" ADD CONSTRAINT "FK_cf00b538ab5083dc794cf9f6860" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "draw_room_layer" DROP CONSTRAINT "FK_cf00b538ab5083dc794cf9f6860"`);
        await queryRunner.query(`ALTER TABLE "draw_room_layer" DROP CONSTRAINT "FK_1545cfdad55ee722e6ad44b7c39"`);
        await queryRunner.query(`ALTER TABLE "draw_room_member" DROP CONSTRAINT "FK_0df34a4fcd18123db0fba13b935"`);
        await queryRunner.query(`ALTER TABLE "draw_room_member" DROP CONSTRAINT "FK_30f70eed1856df5098b09ad0b30"`);
        await queryRunner.query(`ALTER TABLE "draw_room" DROP CONSTRAINT "FK_daf724b21a05462e14c444ce912"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5c1b8b0e5a8a6a10fbdc5eb674"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1545cfdad55ee722e6ad44b7c3"`);
        await queryRunner.query(`DROP TABLE "draw_room_layer"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e8af7eea910660b78752d32ecf"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0df34a4fcd18123db0fba13b93"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_30f70eed1856df5098b09ad0b3"`);
        await queryRunner.query(`DROP TABLE "draw_room_member"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f5ee2da032bfe82eecf8a6c86e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_daf724b21a05462e14c444ce91"`);
        await queryRunner.query(`DROP TABLE "draw_room"`);
    }
}
