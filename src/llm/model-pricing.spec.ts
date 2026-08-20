import { computeCostUsd, MODEL_PRICES, STUB_MODEL } from './model-pricing';

describe('computeCostUsd', () => {
  it('입력·출력 토큰을 모델 단가로 환산한다', () => {
    // Opus 5: 입력 $5 / 출력 $25 per 1M
    const cost = computeCostUsd('claude-opus-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(cost).toBeCloseTo(30, 6);
  });

  it('캐시 읽기는 입력가의 0.1배로 매긴다', () => {
    const cost = computeCostUsd('claude-opus-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
    });

    expect(cost).toBeCloseTo(0.5, 6);
  });

  it('캐시 쓰기는 입력가의 1.25배로 매긴다', () => {
    const cost = computeCostUsd('claude-opus-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 1_000_000,
    });

    expect(cost).toBeCloseTo(6.25, 6);
  });

  it('스텁 모델은 실제 호출이 아니므로 0원이다', () => {
    const cost = computeCostUsd(STUB_MODEL, {
      inputTokens: 10_000,
      outputTokens: 10_000,
    });

    expect(cost).toBe(0);
  });

  it('단가표에 없는 모델은 0원으로 넘기지 않고 예외를 던진다', () => {
    // 조용히 0으로 집계하면 대시보드가 적자를 감춘다.
    expect(() =>
      computeCostUsd('claude-unknown-9', {
        inputTokens: 1000,
        outputTokens: 1000,
      }),
    ).toThrow(/Unknown model/);
  });

  it('Opus 5의 최소 캐시 프리픽스는 512 토큰이다', () => {
    // Sonnet 5(1024)·Haiku 4.5(4096)와 달라 프롬프트 설계에 영향을 준다.
    expect(MODEL_PRICES['claude-opus-5'].minCacheTokens).toBe(512);
    expect(MODEL_PRICES['claude-sonnet-5'].minCacheTokens).toBe(1024);
    expect(MODEL_PRICES['claude-haiku-4-5'].minCacheTokens).toBe(4096);
  });
});
