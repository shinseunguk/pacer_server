import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/** 약관·개인정보·LLM 전송 동의 이력. */
@Entity('user_agreements')
export class UserAgreement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** 이용약관(필수) */
  @Column({ type: 'boolean' })
  terms: boolean;

  /** 개인정보 처리(필수) */
  @Column({ type: 'boolean' })
  privacy: boolean;

  /** LLM 전송 고지 동의(필수) */
  @Column({ name: 'llm_consent', type: 'boolean' })
  llmConsent: boolean;

  /** 선택 */
  @Column({ type: 'boolean', default: false })
  marketing: boolean;

  @Column({ name: 'agreed_at', type: 'timestamptz' })
  agreedAt: Date;
}
