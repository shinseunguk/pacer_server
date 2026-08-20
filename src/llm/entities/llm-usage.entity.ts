import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** 어떤 LLM 호출이었는지 (포트 메서드와 1:1). */
export type LlmMethod = 'generateQuestions' | 'decideNextTurn' | 'evaluate';

/**
 * LLM 호출 1회의 사용량·비용 기록.
 *
 * 구독가 ₩9,900은 면접당 $0.33이라는 **추정** 위에 서 있다. 실제로 얼마가 나가는지
 * 재지 않으면 흑자·적자를 판단할 수 없어 이 테이블이 그 근거가 된다.
 *
 * **프롬프트·답변 원문은 저장하지 않는다.** 면접 답변은 민감 개인정보이고,
 * 사용량 집계에 원문이 필요하지 않다.
 */
@Entity('llm_usages')
@Index('idx_llm_usages_created', ['createdAt'])
@Index('idx_llm_usages_session', ['sessionId'])
export class LlmUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 면접 세션 id. FK를 걸지 않는다 — 세션이 지워져도(회원 탈퇴 등) 비용 집계는
   * 남아야 하고, 이 값만으로는 개인을 식별할 수 없다.
   */
  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId: string | null;

  @Column({ type: 'varchar' })
  method: LlmMethod;

  @Column({ type: 'varchar' })
  model: string;

  @Column({ name: 'input_tokens', type: 'int', default: 0 })
  inputTokens: number;

  /** thinking 토큰을 포함한다 — 공급자가 출력으로 과금하기 때문이다. */
  @Column({ name: 'output_tokens', type: 'int', default: 0 })
  outputTokens: number;

  @Column({ name: 'cache_read_tokens', type: 'int', default: 0 })
  cacheReadTokens: number;

  @Column({ name: 'cache_write_tokens', type: 'int', default: 0 })
  cacheWriteTokens: number;

  /** 호출 1회 비용(USD). 단가가 바뀌어도 과거 집계가 흔들리지 않게 값으로 굳힌다. */
  @Column({
    name: 'cost_usd',
    type: 'numeric',
    precision: 12,
    scale: 6,
    default: 0,
  })
  costUsd: string;

  @Column({ name: 'latency_ms', type: 'int', default: 0 })
  latencyMs: number;

  /** 호출 실패(스키마 위반·타임아웃 등)도 토큰은 나가므로 함께 기록한다. */
  @Column({ name: 'is_error', type: 'boolean', default: false })
  isError: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
