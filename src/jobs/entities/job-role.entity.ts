import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { JobCategory } from './job-category.entity';

/** 직무 세부(대분류 하위). */
@Entity('job_roles')
export class JobRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => JobCategory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: JobCategory;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
