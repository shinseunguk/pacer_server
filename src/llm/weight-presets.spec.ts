import {
  computeOverallScore,
  CRITERIA,
  resolveWeightPreset,
  WEIGHT_PRESETS,
  weightsOf,
} from './weight-presets';

describe('weight-presets', () => {
  it('모든 프리셋의 가중치 합은 1.0이다', () => {
    for (const [preset, weights] of Object.entries(WEIGHT_PRESETS)) {
      const sum = CRITERIA.reduce(
        (total, criterion) => total + weights[criterion],
        0,
      );
      expect({ preset, sum: Number(sum.toFixed(4)) }).toEqual({
        preset,
        sum: 1,
      });
    }
  });

  it('직무 대분류를 프리셋으로 매핑한다', () => {
    expect(resolveWeightPreset('개발')).toBe('developer');
    expect(resolveWeightPreset('마케팅')).toBe('sales_marketing');
    expect(resolveWeightPreset('기획')).toBe('planning');
  });

  it('매핑에 없는 대분류·직접입력은 general로 폴백한다', () => {
    expect(resolveWeightPreset('기타 전문')).toBe('general');
    expect(resolveWeightPreset(null)).toBe('general');
    expect(weightsOf('없는프리셋')).toEqual(WEIGHT_PRESETS.general);
  });

  it('종합 점수를 가중치로 다시 계산한다', () => {
    const score = computeOverallScore(
      [
        { criterion: 'logic', score: 80 },
        { criterion: 'job_fit', score: 60 },
        { criterion: 'structure', score: 40 },
        { criterion: 'keyword', score: 100 },
      ],
      weightsOf('developer'),
    );

    // 80×0.2 + 60×0.35 + 40×0.15 + 100×0.3
    expect(score).toBe(73);
  });

  it('빠진 항목은 0점으로, 범위를 벗어난 점수는 0~100으로 보정한다', () => {
    const score = computeOverallScore(
      [
        { criterion: 'logic', score: 200 },
        { criterion: 'job_fit', score: -50 },
      ],
      weightsOf('general'),
    );

    // logic 100×0.25 + 나머지 0
    expect(score).toBe(25);
  });
});
