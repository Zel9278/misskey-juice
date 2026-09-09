/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// JUICE: emoji_request/avatar_decoration_requestのstatusに、申請者自身による取り下げを
// 表す'cancelled'を追加した。カラム定義(varchar(16))自体は変更不要で、コメントのみ更新する
export class AddCancelledStatusToRequests1788900244816 {
    name = 'AddCancelledStatusToRequests1788900244816';

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query('COMMENT ON COLUMN "emoji_request"."status" IS \'The status of this request (JUICE): pending, approved, rejected, or cancelled.\'');
        await queryRunner.query('COMMENT ON COLUMN "avatar_decoration_request"."status" IS \'The status of this request (JUICE): pending, approved, rejected, or cancelled.\'');
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query('COMMENT ON COLUMN "emoji_request"."status" IS \'The status of this request (JUICE): pending, approved, or rejected.\'');
        await queryRunner.query('COMMENT ON COLUMN "avatar_decoration_request"."status" IS \'The status of this request (JUICE): pending, approved, or rejected.\'');
    }
};
