import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { JobRole } from './job-role.entity';

/** 직무 대분류. */
@Entity('job_categories')
export class JobCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /** 역방향 관계 — 컬럼을 만들지 않으므로 스키마 영향 없음. */
  @OneToMany(() => JobRole, (role) => role.category)
  roles: JobRole[];
}
