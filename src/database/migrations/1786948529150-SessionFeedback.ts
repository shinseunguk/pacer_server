import { MigrationInterface, QueryRunner } from 'typeorm';

export class SessionFeedback1786948529150 implements MigrationInterface {
  name = 'SessionFeedback1786948529150';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "session_feedbacks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "rating" character varying NOT NULL, "comment" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "session_id" uuid, CONSTRAINT "REL_183543f883189ba9117f5fa050" UNIQUE ("session_id"), CONSTRAINT "PK_13e2238ffdbce1ade74ec99d005" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_feedbacks" ADD CONSTRAINT "FK_183543f883189ba9117f5fa0509" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "session_feedbacks" DROP CONSTRAINT "FK_183543f883189ba9117f5fa0509"`,
    );
    await queryRunner.query(`DROP TABLE "session_feedbacks"`);
  }
}
