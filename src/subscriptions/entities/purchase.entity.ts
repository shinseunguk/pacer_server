import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export const PURCHASE_PLATFORMS = ['apple', 'google', 'stub'] as const;
export type PurchasePlatform = (typeof PURCHASE_PLATFORMS)[number];

export const PURCHASE_STATUSES = [
  'active',
  'expired',
  'canceled',
  'refunded',
] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/**
 * 스토어에서 검증된 거래 1건.
 *
 * `transactionId`에 유니크 제약을 건다 — 앱이 같은 영수증을 두 번 보내도(네트워크
 * 재시도, 복원) 이용권이 두 번 부여되지 않게 하는 **멱등성의 근거**다.
 */
@Entity('purchases')
@Unique('uq_purchases_transaction', ['platform', 'transactionId'])
@Index('idx_purchases_user', ['user'])
export class Purchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'product_sku', type: 'varchar' })
  productSku: string;

  @Column({ type: 'varchar' })
  platform: PurchasePlatform;

  /** 스토어의 거래 식별자. 갱신마다 새로 발급된다. */
  @Column({ name: 'transaction_id', type: 'varchar' })
  transactionId: string;

  /**
   * 최초 구매의 거래 식별자. 갱신 거래들이 이 값으로 묶이므로
   * 구독 하나의 생애를 추적하는 키다.
   */
  @Column({ name: 'original_transaction_id', type: 'varchar' })
  originalTransactionId: string;

  @Column({ name: 'purchased_at', type: 'timestamptz' })
  purchasedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'varchar', default: 'active' })
  status: PurchaseStatus;

  /** sandbox 거래가 운영 이용권을 만들지 않도록 함께 기록한다. */
  @Column({ type: 'varchar', default: 'production' })
  environment: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
