const KST_OFFSET_MINUTES = 9 * 60;
const MINUTE_IN_MS = 60_000;

/**
 * KST 기준 오늘 날짜(YYYY-MM-DD).
 * 일일 사용량은 자정(KST)에 리셋되므로 서버 타임존과 무관하게 KST로 계산한다.
 */
export function todayInKst(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MINUTES * MINUTE_IN_MS);
  return kst.toISOString().slice(0, 10);
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const SECOND_IN_MS = 1000;

/**
 * 다음 KST 자정까지 남은 초.
 * Redis 일일 카운터 TTL로 사용해 자정에 자동으로 리셋되게 한다.
 */
export function secondsUntilKstMidnight(now: Date = new Date()): number {
  const kstNow = now.getTime() + KST_OFFSET_MINUTES * MINUTE_IN_MS;
  const elapsedToday = ((kstNow % DAY_IN_MS) + DAY_IN_MS) % DAY_IN_MS;
  return Math.ceil((DAY_IN_MS - elapsedToday) / SECOND_IN_MS);
}
