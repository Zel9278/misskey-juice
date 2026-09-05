/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class EmojiAvatarDecorationRequestTarget1788547044605 {
    name = 'EmojiAvatarDecorationRequestTarget1788547044605'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "emoji_request" ADD "targetEmojiId" character varying(32)`);
        await queryRunner.query(`COMMENT ON COLUMN "emoji_request"."targetEmojiId" IS 'The ID of the emoji this request wants to replace the image of, if this is a replacement request (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "avatar_decoration_request" ADD "targetAvatarDecorationId" character varying(32)`);
        await queryRunner.query(`COMMENT ON COLUMN "avatar_decoration_request"."targetAvatarDecorationId" IS 'The ID of the avatar decoration this request wants to replace the image of, if this is a replacement request (JUICE).'`);
        await queryRunner.query(`CREATE INDEX "IDX_890cd59184533f9c836af8fdfb" ON "emoji_request" ("targetEmojiId")`);
        await queryRunner.query(`CREATE INDEX "IDX_06ea7e8d415cf121a0c5c5f075" ON "avatar_decoration_request" ("targetAvatarDecorationId")`);
        await queryRunner.query(`ALTER TABLE "emoji_request" ADD CONSTRAINT "FK_890cd59184533f9c836af8fdfbc" FOREIGN KEY ("targetEmojiId") REFERENCES "emoji"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "avatar_decoration_request" ADD CONSTRAINT "FK_06ea7e8d415cf121a0c5c5f0750" FOREIGN KEY ("targetAvatarDecorationId") REFERENCES "avatar_decoration"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "avatar_decoration_request" DROP CONSTRAINT "FK_06ea7e8d415cf121a0c5c5f0750"`);
        await queryRunner.query(`ALTER TABLE "emoji_request" DROP CONSTRAINT "FK_890cd59184533f9c836af8fdfbc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_06ea7e8d415cf121a0c5c5f075"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_890cd59184533f9c836af8fdfb"`);
        await queryRunner.query(`ALTER TABLE "avatar_decoration_request" DROP COLUMN "targetAvatarDecorationId"`);
        await queryRunner.query(`ALTER TABLE "emoji_request" DROP COLUMN "targetEmojiId"`);
    }
}
