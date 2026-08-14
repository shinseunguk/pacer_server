import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InterviewMessage } from './interview-message.entity';

/** 질문/답변 단위 피드백 + 모범답안 (메시지 1:N). */
@Entity('message_feedbacks')
export class MessageFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => InterviewMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message: InterviewMessage;

  /** 실시간/사후 피드백 */
  @Column({ type: 'text', nullable: true })
  feedback: string | null;

  /** 일반 모범답안 */
  @Column({ name: 'model_answer', type: 'text', nullable: true })
  modelAnswer: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
