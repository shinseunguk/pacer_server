import { MigrationInterface, QueryRunner } from 'typeorm';

export class DerivedJobLabels1787347200000 implements MigrationInterface {
  name = 'DerivedJobLabels1787347200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "interview_sessions" ADD "derived_company" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "interview_sessions" ADD "derived_role" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "interview_sessions" DROP COLUMN "derived_role"`,
    );
    await queryRunner.query(
      `ALTER TABLE "interview_sessions" DROP COLUMN "derived_company"`,
    );
  }
}
