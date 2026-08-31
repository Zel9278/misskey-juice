/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class EmojiRequestFields1787884111375 {
    name = 'EmojiRequestFields1787884111375'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "emoji_request" ADD "aliases" character varying(128) array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`COMMENT ON COLUMN "emoji_request"."aliases" IS 'The requested emoji aliases (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "emoji_request" ADD "isSensitive" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "emoji_request"."isSensitive" IS 'Whether the requested emoji should be marked as sensitive (JUICE).'`);
        await queryRunner.query(`ALTER TABLE "emoji_request" ADD "localOnly" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "emoji_request"."localOnly" IS 'Whether the requested emoji should be local-only (JUICE).'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "emoji_request" DROP COLUMN "localOnly"`);
        await queryRunner.query(`ALTER TABLE "emoji_request" DROP COLUMN "isSensitive"`);
        await queryRunner.query(`ALTER TABLE "emoji_request" DROP COLUMN "aliases"`);
    }
}
