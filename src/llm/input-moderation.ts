/**
 * 사용자 입력(공고·자소서) 모더레이션.
 *
 * 공고 원문은 그대로 프롬프트에 실린다. 거기에 "이전 지시를 무시하라" 같은 문장이
 * 섞이면 가드레일 자체가 무력해진다.
 *
 * **높은 정밀도를 우선한다.** 정상 공고를 막는 오탐이 인젝션을 놓치는 것보다 나쁘다 —
 * 인젝션은 프롬프트 규칙·질문 후검증이라는 방어선이 더 있지만, 오탐으로 막힌
 * 사용자에게는 우회로가 없다. 그래서 **지시를 덮어쓰려는 명시적 문구**만 잡는다.
 */

const INJECTION_PATTERNS: RegExp[] = [
  // 한국어. 목적어와 동사 사이에 부사가 끼는 경우가 많아("모두 무시", "그대로 출력")
  // 어절 두 개까지 건너뛴다.
  /(이전|위|앞)[의\s]*(모든\s*)?(지시|명령|규칙|프롬프트)[을를]?\s*(?:\S+\s+){0,2}(무시|잊|삭제|해제)/,
  /(시스템|기존)\s*(프롬프트|지시|규칙)[을를]?\s*(?:\S+\s+){0,2}(무시|알려|출력|보여|공개)/,
  /너는\s*이제\s*.{0,20}(이다|이야|역할)/,
  /(안전\s*규칙|가드레일)[을를]?\s*(무시|해제|끄)/,
  // 영어
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior)\s+(instructions?|rules?)/i,
  /(reveal|print|show)\s+(your\s+)?(system\s+prompt|instructions)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
];

export function containsPromptInjection(text: string | null): boolean {
  if (!text) return false;
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}
