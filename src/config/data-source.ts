import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * TypeORM CLI(마이그레이션)용 DataSource.
 * 앱 런타임 연결은 `DatabaseModule`(TypeOrmModule.forRootAsync)에서 별도로 구성한다.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
