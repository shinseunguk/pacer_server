import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 직무 대분류. */
@Entity('job_categories')
export class JobCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
