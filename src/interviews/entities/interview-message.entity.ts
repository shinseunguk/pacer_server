import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InterviewSession } from './interview-session.entity';

/** 면접 대화 발화(질문/답변/꼬리질문) — 대화 전문 재열람의 원천. */
@Entity('interview_messages')
@Index('idx_messages_session_seq', ['session', 'seq'])
export class InterviewMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => InterviewSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: InterviewSession;

  /** 세션 내 순서 */
  @Column({ type: 'int' })
  seq: number;

  /** interviewer | user */
  @Column({ type: 'varchar' })
  role: string;

  /** base_question | follow_up | answer | skip */
  @Column({ type: 'varchar' })
  type: string;

  /** 발화 내용(스킵은 NULL 가능) */
  @Column({ type: 'text', nullable: true })
  content: string | null;

  /** 꼬리질문이 파고든 답변 참조 */
  @ManyToOne(() => InterviewMessage, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent: InterviewMessage | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
