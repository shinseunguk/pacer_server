import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export const PLANS = ['free', 'pro'] as const;
export type Plan = (typeof PLANS)[number];

/**
 * 사용자가 지금 무엇을 쓸 수 있는지 (사용자당 1행).
 *
 * `purchases`에서 매번 계산할 수도 있지만, 면접 생성마다 거래 이력을 훑는 대신
 * 결론만 들고 있는다. 스토어 알림(갱신·해지·환불)이 오면 이 행을 갱신한다.
 */
@Entity('entitlements')
@Unique('uq_entitlements_user', ['user'])
export class Entitlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', default: 'free' })
  plan: Plan;

  /** 구독 만료 시각. free면 null. */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'auto_renewing', type: 'boolean', default: false })
  autoRenewing: boolean;

  /**
   * 무료로 진행한 면접 수. **평생 누적이며 리셋되지 않는다.**
   * 월마다 리셋하면 획득 원가를 영원히 회수하지 못한다.
   */
  @Column({ name: 'free_interviews_used', type: 'int', default: 0 })
  freeInterviewsUsed: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
