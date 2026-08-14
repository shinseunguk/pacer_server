import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1786690736029 implements MigrationInterface {
  name = 'InitialSchema1786690736029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "job_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_a3558e7de1e1252863bc01af86f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "job_roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "category_id" uuid, CONSTRAINT "PK_2010ead772199469bfe54ea513b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "social_provider" character varying NOT NULL, "social_id" character varying NOT NULL, "nickname" character varying NOT NULL, "email" character varying, "is_pro" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_social" ON "users"  ("social_provider", "social_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "interview_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "custom_role" character varying, "job_source" character varying NOT NULL, "job_posting_text" text, "applicant_info" text, "resume_ref" character varying, "interview_type" character varying NOT NULL, "persona" character varying, "language" character varying NOT NULL DEFAULT 'ko', "difficulty" character varying NOT NULL, "question_count" integer NOT NULL, "realtime_feedback" boolean NOT NULL DEFAULT true, "show_score" boolean NOT NULL DEFAULT true, "status" character varying NOT NULL, "final_score" integer, "pass_result" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completed_at" TIMESTAMP WITH TIME ZONE, "user_id" uuid, "job_role_id" uuid, CONSTRAINT "PK_8289f4ee665d0b5e283345db49a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_user_created" ON "interview_sessions"  ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "session_evaluations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "overall_score" integer NOT NULL, "pass_result" character varying NOT NULL, "pass_reason" text NOT NULL, "weight_preset" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "session_id" uuid, CONSTRAINT "REL_82e3322b8a5351e597568d8d1b" UNIQUE ("session_id"), CONSTRAINT "PK_aa40a7bf10d79ac9077eba7feb7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "evaluation_scores" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "criterion" character varying NOT NULL, "score" integer NOT NULL, "weight" numeric, "evaluation_id" uuid, CONSTRAINT "PK_8abcb2f49e1aa22bd312b53ebf5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "interview_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "seq" integer NOT NULL, "role" character varying NOT NULL, "type" character varying NOT NULL, "content" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "session_id" uuid, "parent_id" uuid, CONSTRAINT "PK_67d547b19b6bdf93ad01b8e42d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_messages_session_seq" ON "interview_messages"  ("session_id", "seq") `,
    );
    await queryRunner.query(
      `CREATE TABLE "message_feedbacks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "feedback" text, "model_answer" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "message_id" uuid, CONSTRAINT "PK_fd011564de9f200cded06bdc7f2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "daily_usage" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "usage_date" date NOT NULL, "base_question_count" integer NOT NULL DEFAULT '0', "user_id" uuid, CONSTRAINT "PK_1bd9fdfb7b3346372acc82e8b93" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_daily_usage_user_date" ON "daily_usage"  ("user_id", "usage_date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_agreements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "terms" boolean NOT NULL, "privacy" boolean NOT NULL, "llm_consent" boolean NOT NULL, "marketing" boolean NOT NULL DEFAULT false, "agreed_at" TIMESTAMP WITH TIME ZONE NOT NULL, "user_id" uuid, CONSTRAINT "PK_40142c99b09d69434f28eb0ebdb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_roles" ADD CONSTRAINT "FK_b203f75e4e34dabb0fba686e98a" FOREIGN KEY ("category_id") REFERENCES "job_categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "interview_sessions" ADD CONSTRAINT "FK_256af682c73f96827ea2927f99d" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "interview_sessions" ADD CONSTRAINT "FK_56b603088960c6d77d34e207170" FOREIGN KEY ("job_role_id") REFERENCES "job_roles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_evaluations" ADD CONSTRAINT "FK_82e3322b8a5351e597568d8d1b7" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "evaluation_scores" ADD CONSTRAINT "FK_6179dfeeacc984b1ae4fc885258" FOREIGN KEY ("evaluation_id") REFERENCES "session_evaluations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "interview_messages" ADD CONSTRAINT "FK_15e967c92f99cbd8d21f967bc79" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "interview_messages" ADD CONSTRAINT "FK_dadcfcd166a82740cd58a58014e" FOREIGN KEY ("parent_id") REFERENCES "interview_messages"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedbacks" ADD CONSTRAINT "FK_085e6e76b78d76d01f373127ec5" FOREIGN KEY ("message_id") REFERENCES "interview_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_usage" ADD CONSTRAINT "FK_a082e398adfbfc6778659718f32" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_agreements" ADD CONSTRAINT "FK_94748d77c6aecf02feb4b751ba4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_agreements" DROP CONSTRAINT "FK_94748d77c6aecf02feb4b751ba4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_usage" DROP CONSTRAINT "FK_a082e398adfbfc6778659718f32"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedbacks" DROP CONSTRAINT "FK_085e6e76b78d76d01f373127ec5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "interview_messages" DROP CONSTRAINT "FK_dadcfcd166a82740cd58a58014e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "interview_messages" DROP CONSTRAINT "FK_15e967c92f99cbd8d21f967bc79"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evaluation_scores" DROP CONSTRAINT "FK_6179dfeeacc984b1ae4fc885258"`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_evaluations" DROP CONSTRAINT "FK_82e3322b8a5351e597568d8d1b7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "interview_sessions" DROP CONSTRAINT "FK_56b603088960c6d77d34e207170"`,
    );
    await queryRunner.query(
      `ALTER TABLE "interview_sessions" DROP CONSTRAINT "FK_256af682c73f96827ea2927f99d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_roles" DROP CONSTRAINT "FK_b203f75e4e34dabb0fba686e98a"`,
    );
    await queryRunner.query(`DROP TABLE "user_agreements"`);
    await queryRunner.query(`DROP INDEX "public"."uq_daily_usage_user_date"`);
    await queryRunner.query(`DROP TABLE "daily_usage"`);
    await queryRunner.query(`DROP TABLE "message_feedbacks"`);
    await queryRunner.query(`DROP INDEX "public"."idx_messages_session_seq"`);
    await queryRunner.query(`DROP TABLE "interview_messages"`);
    await queryRunner.query(`DROP TABLE "evaluation_scores"`);
    await queryRunner.query(`DROP TABLE "session_evaluations"`);
    await queryRunner.query(`DROP INDEX "public"."idx_sessions_user_created"`);
    await queryRunner.query(`DROP TABLE "interview_sessions"`);
    await queryRunner.query(`DROP INDEX "public"."uq_users_social"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "job_roles"`);
    await queryRunner.query(`DROP TABLE "job_categories"`);
  }
}
