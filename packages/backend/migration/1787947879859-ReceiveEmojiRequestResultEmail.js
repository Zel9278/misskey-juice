/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ReceiveEmojiRequestResultEmail1787947879859 {
    name = 'ReceiveEmojiRequestResultEmail1787947879859'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "receiveEmojiRequestResultEmail" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."receiveEmojiRequestResultEmail" IS 'Whether to receive an email when own emoji request is approved/rejected (JUICE).'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "receiveEmojiRequestResultEmail"`);
    }
}
