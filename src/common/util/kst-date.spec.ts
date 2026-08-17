import { secondsUntilKstMidnight, todayInKst } from './kst-date';

const DAY_IN_SECONDS = 24 * 60 * 60;

describe('kst-date', () => {
  it('UTC 기준 전날 오후여도 KST로는 다음 날이다', () => {
    // 2026-08-14T16:00Z = 2026-08-15T01:00 KST
    expect(todayInKst(new Date('2026-08-14T16:00:00Z'))).toBe('2026-08-15');
    expect(todayInKst(new Date('2026-08-14T14:59:59Z'))).toBe('2026-08-14');
  });

  it('KST 자정까지 남은 초를 계산한다', () => {
    // 2026-08-14T15:00Z = 2026-08-15T00:00 KST → 정확히 하루
    expect(secondsUntilKstMidnight(new Date('2026-08-14T15:00:00Z'))).toBe(
      DAY_IN_SECONDS,
    );
    // 2026-08-14T14:00Z = 2026-08-14T23:00 KST → 1시간
    expect(secondsUntilKstMidnight(new Date('2026-08-14T14:00:00Z'))).toBe(
      3600,
    );
  });

  it('남은 초는 항상 양수다', () => {
    for (const hour of [0, 6, 12, 18, 23]) {
      const at = new Date(`2026-08-14T${String(hour).padStart(2, '0')}:30:00Z`);
      const remaining = secondsUntilKstMidnight(at);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(DAY_IN_SECONDS);
    }
  });
});
