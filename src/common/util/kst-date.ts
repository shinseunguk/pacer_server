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
