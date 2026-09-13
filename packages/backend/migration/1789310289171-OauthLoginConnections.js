/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class OauthLoginConnections1789310289171 {
    name = 'OauthLoginConnections1789310289171'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "user_oauth_connection" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "provider" character varying(32) NOT NULL, "providerUserId" character varying(256) NOT NULL, "providerUsername" character varying(256) NOT NULL, "linkedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0258d6f076cd460722a077b7d01" PRIMARY KEY ("id")); COMMENT ON COLUMN "user_oauth_connection"."provider" IS 'The OAuth provider this connection belongs to (JUICE).'; COMMENT ON COLUMN "user_oauth_connection"."providerUserId" IS 'The user id on the provider side (JUICE).'; COMMENT ON COLUMN "user_oauth_connection"."providerUsername" IS 'The display username on the provider side, for UI purposes only (JUICE).'`);
        await queryRunner.query(`CREATE INDEX "IDX_fbc37e9e31177c2380711b1dc4" ON "user_oauth_connection"  ("userId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_dd4536ebdfd973553fb52fd7eb" ON "user_oauth_connection"  ("userId", "provider") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ab5a2ca8acb057bb1c6fdb6d7e" ON "user_oauth_connection"  ("provider", "providerUserId") `);
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "useOauthLogin" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."useOauthLogin" IS 'Whether to allow signing in via a linked OAuth provider (Discord/Google/GitHub) (JUICE). Requires twoFactorEnabled.'`);
        await queryRunner.query(`ALTER TABLE "user_oauth_connection" ADD CONSTRAINT "FK_fbc37e9e31177c2380711b1dc49" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_oauth_connection" DROP CONSTRAINT "FK_fbc37e9e31177c2380711b1dc49"`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."useOauthLogin" IS 'Whether to allow signing in via a linked OAuth provider (Discord/Google/GitHub) (JUICE). Requires twoFactorEnabled.'`);
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "useOauthLogin"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ab5a2ca8acb057bb1c6fdb6d7e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dd4536ebdfd973553fb52fd7eb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fbc37e9e31177c2380711b1dc4"`);
        await queryRunner.query(`DROP TABLE "user_oauth_connection"`);
    }
}
