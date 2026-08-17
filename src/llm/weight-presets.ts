/**
 * 직무별 평가 가중치 프리셋 (AI 프롬프트 설계 §7).
 * 프롬프트에 주입하는 동시에, LLM이 돌려준 종합 점수를 서버가 재계산·검산하는 기준이다.
 */

export const CRITERIA = ['logic', 'job_fit', 'structure', 'keyword'] as const;
export type Criterion = (typeof CRITERIA)[number];

export type CriterionWeights = Record<Criterion, number>;

export const DEFAULT_WEIGHT_PRESET = 'general';

/** 가중치 합은 항상 1.0 (weight-presets.spec.ts에서 검증). */
export const WEIGHT_PRESETS: Record<string, CriterionWeights> = {
  developer: { logic: 0.2, job_fit: 0.35, structure: 0.15, keyword: 0.3 },
  sales_marketing: { logic: 0.35, job_fit: 0.3, structure: 0.15, keyword: 0.2 },
  design: { logic: 0.3, job_fit: 0.25, structure: 0.25, keyword: 0.2 },
  planning: { logic: 0.3, job_fit: 0.25, structure: 0.3, keyword: 0.15 },
  general: { logic: 0.25, job_fit: 0.25, structure: 0.25, keyword: 0.25 },
};

/** 직무 대분류(시드 카테고리명) → 프리셋. 세부 직무 미세 프리셋은 P1. */
const CATEGORY_TO_PRESET: Record<string, string> = {
  개발: 'developer',
  '데이터·분석': 'developer',
  기획: 'planning',
  디자인: 'design',
  마케팅: 'sales_marketing',
  '영업·세일즈': 'sales_marketing',
};

/** 대분류를 못 찾으면(기타 전문·직접입력) 균등 프리셋으로 폴백한다. */
export function resolveWeightPreset(categoryName: string | null): string {
  if (!categoryName) return DEFAULT_WEIGHT_PRESET;
  return CATEGORY_TO_PRESET[categoryName] ?? DEFAULT_WEIGHT_PRESET;
}

export function weightsOf(preset: string): CriterionWeights {
  return WEIGHT_PRESETS[preset] ?? WEIGHT_PRESETS[DEFAULT_WEIGHT_PRESET];
}

const MIN_SCORE = 0;
const MAX_SCORE = 100;

export function clampScore(score: number): number {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(score)));
}

/**
 * 종합 점수 = Σ(항목 점수 × 항목 가중치).
 * LLM이 준 overallScore를 그대로 믿지 않고 서버가 다시 계산한다(프롬프트 설계 §9).
 */
export function computeOverallScore(
  scores: { criterion: string; score: number }[],
  weights: CriterionWeights,
): number {
  const byCriterion = new Map(scores.map((s) => [s.criterion, s.score]));

  const weighted = CRITERIA.reduce((sum, criterion) => {
    const score = clampScore(byCriterion.get(criterion) ?? 0);
    return sum + score * weights[criterion];
  }, 0);

  return clampScore(weighted);
}
