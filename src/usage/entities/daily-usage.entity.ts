import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/** 일별 기본 질문 사용량 (영속 백업; 실시간 카운터는 Redis). */
@Entity('daily_usage')
@Index('uq_daily_usage_user_date', ['user', 'usageDate'], { unique: true })
export class DailyUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** KST 기준 날짜 */
  @Column({ name: 'usage_date', type: 'date' })
  usageDate: string;

  /** 꼬리질문 제외 카운트 */
  @Column({ name: 'base_question_count', type: 'int', default: 0 })
  baseQuestionCount: number;
}
