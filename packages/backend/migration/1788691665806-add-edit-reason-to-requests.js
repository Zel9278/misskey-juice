/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddEditReasonToRequests1788691665806 {
    name = 'AddEditReasonToRequests1788691665806';

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "emoji_request" ADD "editReason" text');
        await queryRunner.query('COMMENT ON COLUMN "emoji_request"."editReason" IS \'The reason given by the moderator/admin for editing this request\'\'s content upon approval, if edited (JUICE).\'');
        await queryRunner.query('ALTER TABLE "avatar_decoration_request" ADD "editReason" text');
        await queryRunner.query('COMMENT ON COLUMN "avatar_decoration_request"."editReason" IS \'The reason given by the moderator/admin for editing this request\'\'s content upon approval, if edited (JUICE).\'');
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "avatar_decoration_request" DROP COLUMN "editReason"');
        await queryRunner.query('ALTER TABLE "emoji_request" DROP COLUMN "editReason"');
    }
};
