import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InterviewSession } from './interview-session.entity';

/** 세션 최종 평가 (세션 1:1). */
@Entity('session_evaluations')
export class SessionEvaluation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => InterviewSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: InterviewSession;

  /** 100점 만점 */
  @Column({ name: 'overall_score', type: 'int' })
  overallScore: number;

  /** pass | fail */
  @Column({ name: 'pass_result', type: 'varchar' })
  passResult: string;

  /** 합불 판정 근거 */
  @Column({ name: 'pass_reason', type: 'text' })
  passReason: string;

  /** 적용된 직무 가중치 프리셋 */
  @Column({ name: 'weight_preset', type: 'varchar' })
  weightPreset: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
