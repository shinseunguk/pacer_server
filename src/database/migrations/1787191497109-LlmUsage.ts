import { MigrationInterface, QueryRunner } from 'typeorm';

export class LlmUsage1787191497109 implements MigrationInterface {
  name = 'LlmUsage1787191497109';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "llm_usages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "session_id" uuid, "method" character varying NOT NULL, "model" character varying NOT NULL, "input_tokens" integer NOT NULL DEFAULT '0', "output_tokens" integer NOT NULL DEFAULT '0', "cache_read_tokens" integer NOT NULL DEFAULT '0', "cache_write_tokens" integer NOT NULL DEFAULT '0', "cost_usd" numeric(12,6) NOT NULL DEFAULT '0', "latency_ms" integer NOT NULL DEFAULT '0', "is_error" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2b7d94112db0db5bff1c37b7c79" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_llm_usages_session" ON "llm_usages"  ("session_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_llm_usages_created" ON "llm_usages"  ("created_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_llm_usages_created"`);
    await queryRunner.query(`DROP INDEX "public"."idx_llm_usages_session"`);
    await queryRunner.query(`DROP TABLE "llm_usages"`);
  }
}
