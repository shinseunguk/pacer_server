import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 사용자 계정 (소셜 로그인). */
@Entity('users')
@Index('uq_users_social', ['socialProvider', 'socialId'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** kakao | apple | google */
  @Column({ name: 'social_provider', type: 'varchar' })
  socialProvider: string;

  @Column({ name: 'social_id', type: 'varchar' })
  socialId: string;

  /** 온보딩 입력값(표시 닉네임 정본) */
  @Column({ type: 'varchar' })
  nickname: string;

  /** 애플 relay/거부 대비 nullable */
  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  /** 구독 활성 캐시값 (정본은 subscriptions — Phase B) */
  @Column({ name: 'is_pro', type: 'boolean', default: false })
  isPro: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** 탈퇴 시각(파기 처리 트리거) */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
