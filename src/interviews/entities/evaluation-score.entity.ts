import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SessionEvaluation } from './session-evaluation.entity';

/** 평가 항목별 점수 (평가 1:N). */
@Entity('evaluation_scores')
export class EvaluationScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SessionEvaluation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'evaluation_id' })
  evaluation: SessionEvaluation;

  /** logic | job_fit | structure | keyword */
  @Column({ type: 'varchar' })
  criterion: string;

  /** 항목 점수 */
  @Column({ type: 'int' })
  score: number;

  /** 해당 항목 가중치 */
  @Column({ type: 'numeric', nullable: true })
  weight: string | null;
}
