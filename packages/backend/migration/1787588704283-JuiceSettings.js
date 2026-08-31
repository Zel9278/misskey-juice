/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class JuiceSettings1787588704283 {
    name = 'JuiceSettings1787588704283'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "juice_settings" ("id" character varying(32) NOT NULL, "settings" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_11c8e9217e48c2ba946cf976807" PRIMARY KEY ("id"))`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE "juice_settings"`);
    }
}
