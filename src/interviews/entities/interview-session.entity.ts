import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { JobRole } from '../../jobs/entities/job-role.entity';
import { User } from '../../users/entities/user.entity';

/** 면접 1건(설정 + 결과 요약). */
@Entity('interview_sessions')
@Index('idx_sessions_user_created', ['user', 'createdAt'])
export class InterviewSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** 템플릿 선택 시 */
  @ManyToOne(() => JobRole, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'job_role_id' })
  jobRole: JobRole | null;

  /** 기타 직접입력 */
  @Column({ name: 'custom_role', type: 'varchar', nullable: true })
  customRole: string | null;

  /**
   * 공고에서 LLM이 읽어낸 회사명 ("빗썸").
   *
   * 직무와 별도 칸에 둔다. 이력을 구분해 주는 건 회사이고, 직무는 대개 고정이라
   * 한 덩어리로 합치면 사용자가 직무를 직접 고른 순간 회사까지 사라진다.
   */
  @Column({ name: 'derived_company', type: 'varchar', nullable: true })
  derivedCompany: string | null;

  /**
   * 공고에서 LLM이 읽어낸 직무명 ("iOS 개발자").
   *
   * `custom_role`과 섞지 않는다 — 그쪽은 사용자가 직접 적은 값이라
   * 추출값으로 덮으면 사용자의 입력이 소리 없이 사라진다.
   */
  @Column({ name: 'derived_role', type: 'varchar', nullable: true })
  derivedRole: string | null;

  /** paste | url | template */
  @Column({ name: 'job_source', type: 'varchar' })
  jobSource: string;

  /** 공고 원문(민감·파기 대상) */
  @Column({ name: 'job_posting_text', type: 'text', nullable: true })
  jobPostingText: string | null;

  /** 경력·자소서(민감·파기 대상) */
  @Column({ name: 'applicant_info', type: 'text', nullable: true })
  applicantInfo: string | null;

  /** 이력서 저장 참조(선택) */
  @Column({ name: 'resume_ref', type: 'varchar', nullable: true })
  resumeRef: string | null;

  /** general | pressure | personality | job | executive */
  @Column({ name: 'interview_type', type: 'varchar' })
  interviewType: string;

  /** 페르소나(P1) */
  @Column({ type: 'varchar', nullable: true })
  persona: string | null;

  /** ko | en */
  @Column({ type: 'varchar', default: 'ko' })
  language: string;

  /** low | mid | high */
  @Column({ type: 'varchar' })
  difficulty: string;

  /** 기본 질문 수 설정 */
  @Column({ name: 'question_count', type: 'int' })
  questionCount: number;

  @Column({ name: 'realtime_feedback', type: 'boolean', default: true })
  realtimeFeedback: boolean;

  @Column({ name: 'show_score', type: 'boolean', default: true })
  showScore: boolean;

  /** in_progress | paused | completed */
  @Column({ type: 'varchar' })
  status: string;

  /** 종합 점수(완료 시) */
  @Column({ name: 'final_score', type: 'int', nullable: true })
  finalScore: number | null;

  /** pass | fail */
  @Column({ name: 'pass_result', type: 'varchar', nullable: true })
  passResult: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
