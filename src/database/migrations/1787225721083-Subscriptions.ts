import { MigrationInterface, QueryRunner } from 'typeorm';

export class Subscriptions1787225721083 implements MigrationInterface {
  name = 'Subscriptions1787225721083';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "entitlements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "plan" character varying NOT NULL DEFAULT 'free', "expires_at" TIMESTAMP WITH TIME ZONE, "auto_renewing" boolean NOT NULL DEFAULT false, "free_interviews_used" integer NOT NULL DEFAULT '0', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid, CONSTRAINT "uq_entitlements_user" UNIQUE ("user_id"), CONSTRAINT "REL_30d2208c43f245217c03cb7ce3" UNIQUE ("user_id"), CONSTRAINT "PK_6a45cb6f5747d49365a879bffde" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sku" character varying NOT NULL, "name" character varying NOT NULL, "price_krw" integer NOT NULL, "period_months" integer NOT NULL DEFAULT '1', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "uq_products_sku" UNIQUE ("sku"), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "purchases" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_sku" character varying NOT NULL, "platform" character varying NOT NULL, "transaction_id" character varying NOT NULL, "original_transaction_id" character varying NOT NULL, "purchased_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying NOT NULL DEFAULT 'active', "environment" character varying NOT NULL DEFAULT 'production', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid, CONSTRAINT "uq_purchases_transaction" UNIQUE ("platform", "transaction_id"), CONSTRAINT "PK_1d55032f37a34c6eceacbbca6b8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_purchases_user" ON "purchases"  ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "entitlements" ADD CONSTRAINT "FK_30d2208c43f245217c03cb7ce31" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchases" ADD CONSTRAINT "FK_024ddf7e04177a07fcb9806a90a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // 기본 상품. 가격을 테이블에서 관리하기로 했으므로 행이 없으면 아무것도 팔 수 없다.
    await queryRunner.query(
      `INSERT INTO "products" ("sku", "name", "price_krw", "period_months", "is_active") VALUES ('pro_monthly', 'Pacer Pro 월 구독', 9900, 1, true)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "products" WHERE "sku" = 'pro_monthly'`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchases" DROP CONSTRAINT "FK_024ddf7e04177a07fcb9806a90a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "entitlements" DROP CONSTRAINT "FK_30d2208c43f245217c03cb7ce31"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_purchases_user"`);
    await queryRunner.query(`DROP TABLE "purchases"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "entitlements"`);
  }
}
