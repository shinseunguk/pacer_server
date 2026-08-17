import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * TypeORM CLI(마이그레이션)용 DataSource.
 * 앱 런타임 연결은 `DatabaseModule`(TypeOrmModule.forRootAsync)에서 별도로 구성한다.
 */
/** 빌드 결과(dist)로 실행되면 컴파일된 파일을 가리켜야 한다 — 운영 이미지 마이그레이션용. */
const isCompiled = __filename.endsWith('.js');

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [isCompiled ? 'dist/**/*.entity.js' : 'src/**/*.entity.ts'],
  migrations: [
    isCompiled
      ? 'dist/database/migrations/*.js'
      : 'src/database/migrations/*.ts',
  ],
  synchronize: false,
});
