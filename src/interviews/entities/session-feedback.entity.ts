import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InterviewSession } from './interview-session.entity';

/**
 * 리포트 만족도 (세션 1:1) — MVP 성공 기준 §6 "리포트 👍 비율"의 원천.
 * 평가 품질이라는 핵심 가설을 검증하는 지표이므로 베타에서 반드시 수집한다.
 */
@Entity('session_feedbacks')
export class SessionFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => InterviewSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: InterviewSession;

  /** up | down */
  @Column({ type: 'varchar' })
  rating: string;

  /** 👎일 때 받는 이유(선택). 민감 정보가 섞일 수 있어 로그 출력 금지. */
  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 마음이 바뀌어 다시 평가하면 갱신된다. */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
