import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 닉네임 중복 방지 (이슈 #13).
 *
 * 기존 데이터에 중복이 있을 수 있으므로(초기 e2e 계정 등) 먼저 결정적으로 해소한다:
 * 같은 닉네임 그룹에서 **가장 먼저 만들어진 계정이 원본을 유지**하고,
 * 나머지는 `닉네임2`, `닉네임3` … 으로 바꾼다. 그 뒤 유니크 인덱스를 건다.
 *
 * 아직 온보딩하지 않은 계정은 `nickname = ''` 이므로 인덱스 대상에서 제외한다(부분 인덱스).
 */
export class NicknameUnique1786900000000 implements MigrationInterface {
  name = 'NicknameUnique1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 중복 해소 — 접미 숫자를 붙이되, 그 결과가 또 겹치지 않을 때까지 반복한다.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
               nickname,
               row_number() OVER (
                 PARTITION BY lower(nickname) ORDER BY created_at, id
               ) AS rn
        FROM users
        WHERE nickname <> ''
      )
      UPDATE users u
      SET nickname = left(r.nickname, 11) || r.rn::text
      FROM ranked r
      WHERE u.id = r.id AND r.rn > 1
    `);

    // 접미 숫자를 붙인 결과가 기존 닉네임과 겹칠 수 있어 한 번 더 정리한다.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
               row_number() OVER (
                 PARTITION BY lower(nickname) ORDER BY created_at, id
               ) AS rn
        FROM users
        WHERE nickname <> ''
      )
      UPDATE users u
      SET nickname = left(u.nickname, 6) || replace(u.id::text, '-', '')
      FROM ranked r
      WHERE u.id = r.id AND r.rn > 1
    `);

    // 2) 대소문자를 무시한 유니크 인덱스 (빈 닉네임 = 온보딩 전 계정은 제외)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_users_nickname_lower"
      ON "users" (lower(nickname))
      WHERE nickname <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 닉네임 값 변경은 되돌리지 않는다(원본을 알 수 없음). 제약만 해제한다.
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_users_nickname_lower"`);
  }
}
