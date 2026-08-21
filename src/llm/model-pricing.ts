/**
 * 모델별 단가와 호출 1회 비용 계산.
 *
 * 단가는 `docs/Pacer_LLM비용추정_v1.md` 기준(2026-06-24 스냅샷)이며 **USD / 1M 토큰**이다.
 * 문서의 면접당 $0.33은 추정이므로, 여기서 계산한 실측이 유일한 근거가 된다.
 */

/** 캐시 읽기는 입력가의 0.1배, 캐시 쓰기는 1.25배(5분 TTL) — 공급자 정책. */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

const PER_MILLION = 1_000_000;

export interface ModelPrice {
  /** USD / 1M 입력 토큰 */
  input: number;
  /** USD / 1M 출력 토큰 (thinking 토큰도 출력으로 과금된다) */
  output: number;
  /**
   * 프롬프트 캐시가 붙는 최소 프리픽스 길이. 미달하면 조용히 캐싱되지 않는다.
   *
   * 미달인데 `cache_control`을 걸면 **쓰기 요금(1.25배)만 내고 읽기는 0**이 된다.
   * 캐싱을 켠 것보다 끈 게 싼 상태가 되므로 모델별로 반드시 확인한다.
   */
  minCacheTokens: number;
  /**
   * `thinking: {type:'adaptive'}` 지원 여부.
   * 4.6 미만 모델(Haiku 4.5 등)은 **400으로 거부**한다 — 실측으로 확인.
   */
  supportsAdaptiveThinking: boolean;
}

/**
 * 스텁 엔진용 가상 모델. 실제 호출이 아니므로 단가는 0이다.
 * 실어댑터(#32) 전에도 호출 횟수·배선을 확인할 수 있게 기록은 남긴다.
 */
export const STUB_MODEL = 'stub';

export const MODEL_PRICES: Record<string, ModelPrice> = {
  [STUB_MODEL]: {
    input: 0,
    output: 0,
    minCacheTokens: 0,
    supportsAdaptiveThinking: false,
  },
  'claude-opus-5': {
    input: 5,
    output: 25,
    minCacheTokens: 512,
    supportsAdaptiveThinking: true,
  },
  'claude-sonnet-5': {
    input: 3,
    output: 15,
    minCacheTokens: 1024,
    supportsAdaptiveThinking: true,
  },
  'claude-haiku-4-5': {
    input: 1,
    output: 5,
    minCacheTokens: 4096,
    supportsAdaptiveThinking: false,
  },
};

/**
 * 날짜가 붙은 모델 ID를 별칭으로 되돌린다.
 *
 * API 응답의 `model`은 `claude-haiku-4-5-20251001`처럼 스냅샷 날짜가 붙어 오는데
 * 단가표는 별칭(`claude-haiku-4-5`)으로 관리한다. 정규화하지 않으면 단가를 못 찾아
 * **사용량 기록이 통째로 버려지고 대시보드에서 그 호출이 사라진다** — 실측으로 확인.
 */
export function normalizeModel(model: string): string {
  return model.replace(/-\d{8}$/, '');
}

/** 프리픽스가 이 모델에서 실제로 캐싱될 수 있는가. */
export function canCachePrefix(model: string, prefixTokens: number): boolean {
  const price = MODEL_PRICES[normalizeModel(model)];
  if (!price) return false;
  return prefixTokens >= price.minCacheTokens;
}

export function supportsAdaptiveThinking(model: string): boolean {
  return MODEL_PRICES[normalizeModel(model)]?.supportsAdaptiveThinking ?? false;
}

/** LLM 호출 1회가 쓴 토큰. 캐시 토큰은 입력 토큰과 별도로 집계된다. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * 호출 1회 비용(USD).
 *
 * 모르는 모델이면 0이 아니라 예외를 던진다. 단가표에 없는 모델을 0원으로 집계하면
 * 대시보드가 조용히 적자를 감춘다.
 */
export function computeCostUsd(model: string, usage: TokenUsage): number {
  const price = MODEL_PRICES[normalizeModel(model)];
  if (!price) {
    throw new Error(`Unknown model for pricing: ${model}`);
  }

  const inputCost = usage.inputTokens * price.input;
  const outputCost = usage.outputTokens * price.output;
  const cacheReadCost =
    (usage.cacheReadTokens ?? 0) * price.input * CACHE_READ_MULTIPLIER;
  const cacheWriteCost =
    (usage.cacheWriteTokens ?? 0) * price.input * CACHE_WRITE_MULTIPLIER;

  return (
    (inputCost + outputCost + cacheReadCost + cacheWriteCost) / PER_MILLION
  );
}

export function isKnownModel(model: string): boolean {
  return normalizeModel(model) in MODEL_PRICES;
}
