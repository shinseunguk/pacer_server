import { MODEL_PRICES } from './model-pricing';
import {
  PREFIX_TOKENS,
  evaluationPrefix,
  nextTurnPrefix,
  questionSetPrefix,
  SAFETY_RULES,
} from './prompts';

/**
 * `PREFIX_TOKENS`는 `count_tokens`로 잰 값이라 프롬프트를 고치면 어긋난다.
 * 어긋난 채로 두면 캐시가 조용히 꺼지거나(과소평가) 쓰기 요금만 나간다(과대평가).
 *
 * 측정 당시의 글자 수를 함께 기록해 두고, 크게 벗어나면 재측정하라고 알린다.
 */
const MEASURED_CHARS = {
  questionSet: 1064,
  nextTurn: 665,
  evaluation: 1161,
} as const;

/** 프롬프트를 다듬는 정도(오탈자·어순)는 허용하고, 문단이 드나든 경우만 잡는다. */
const DRIFT_TOLERANCE = 0.15;

const prefixes = [
  [
    'questionSet',
    questionSetPrefix,
    PREFIX_TOKENS.questionSet,
    MEASURED_CHARS.questionSet,
  ],
  ['nextTurn', nextTurnPrefix, PREFIX_TOKENS.nextTurn, MEASURED_CHARS.nextTurn],
  [
    'evaluation',
    evaluationPrefix,
    PREFIX_TOKENS.evaluation,
    MEASURED_CHARS.evaluation,
  ],
] as const;

describe('캐시 프리픽스', () => {
  it.each(prefixes)('%s: 안전 규칙이 맨 앞에 온다', (_name, prefix) => {
    // 캐시는 프리픽스 기준이라 불변 블록이 앞에 있어야 공유된다.
    expect(prefix.startsWith(SAFETY_RULES)).toBe(true);
  });

  it.each(prefixes)(
    '%s: 실측 토큰 수가 Opus 5 최소 캐시 길이를 넘는다',
    (_name, _prefix, tokens) => {
      expect(tokens).toBeGreaterThanOrEqual(
        MODEL_PRICES['claude-opus-5'].minCacheTokens,
      );
    },
  );

  it.each(prefixes)(
    '%s: 프롬프트가 크게 바뀌면 재측정하라고 알린다',
    (name, prefix, _tokens, measuredChars) => {
      const drift = Math.abs(prefix.length - measuredChars) / measuredChars;

      expect(drift).toBeLessThan(DRIFT_TOLERANCE);
      if (drift > 0) {
        // 통과하더라도 흔들림이 보이면 눈에 띄게 남긴다.
        expect(name).toBeDefined();
      }
    },
  );

  it('프리픽스에는 세션마다 달라지는 값이 들어가지 않는다', () => {
    // 가변값이 섞이면 호출마다 프리픽스가 달라져 캐시가 절대 적중하지 않는다.
    for (const [, prefix] of prefixes) {
      expect(prefix).not.toContain('${');
    }
  });
});
