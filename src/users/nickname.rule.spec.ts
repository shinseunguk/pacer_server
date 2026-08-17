import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import {
  assertValidNickname,
  findNicknameViolation,
  isValidNickname,
  nicknameKey,
  normalizeNickname,
  toGraphemes,
} from './nickname.rule';

describe('nickname rule', () => {
  describe('허용', () => {
    it.each(['승욱', '재민', 'Pacer', 'pacer2026', 'a1', '개발자123'])(
      '한글·영문·숫자 조합 "%s"',
      (value) => {
        expect(isValidNickname(value)).toBe(true);
      },
    );

    it.each(['승욱🔥', '🔥🔥', '👨‍👩‍👧‍👦2', '👍🏽승욱', '🇰🇷대표'])(
      '이모지 포함 "%s"',
      (value) => {
        expect(isValidNickname(value)).toBe(true);
      },
    );

    it('앞뒤 공백은 잘라내고 판정한다', () => {
      expect(isValidNickname('  승욱  ')).toBe(true);
      expect(assertValidNickname('  승욱  ')).toBe('승욱');
    });
  });

  describe('불가', () => {
    it.each([
      ['한 글자', '김'],
      ['빈 값', ''],
      ['공백뿐', '   '],
    ])('%s — 길이 위반', (_label, value) => {
      expect(findNicknameViolation(value)).toBe('LENGTH');
    });

    it('13자를 넘으면 길이 위반', () => {
      expect(findNicknameViolation('가'.repeat(13))).toBe('LENGTH');
      expect(findNicknameViolation('가'.repeat(12))).toBeNull();
    });

    it.each([
      ['자음 단독', 'ㅋㅋ'],
      ['모음 단독', 'ㅜㅜ'],
      ['중간 공백', '신 승욱'],
      ['특수문자', '승욱!'],
      ['하이픈', '승-욱'],
      ['밑줄', 'pacer_dev'],
    ])('%s — 문자 위반', (_label, value) => {
      expect(findNicknameViolation(value)).toBe('CHARSET');
    });
  });

  describe('이모지 길이 계산', () => {
    it('결합 이모지는 1자로 센다', () => {
      // 가족(ZWJ) · 피부톤 · 국기 — 코드포인트는 여러 개지만 사람 눈에는 한 글자.
      expect(toGraphemes('👨‍👩‍👧‍👦')).toHaveLength(1);
      expect(toGraphemes('👍🏽')).toHaveLength(1);
      expect(toGraphemes('🇰🇷')).toHaveLength(1);
    });

    it('이모지 12개까지 허용하고 13개는 막는다', () => {
      expect(isValidNickname('🔥'.repeat(12))).toBe(true);
      expect(isValidNickname('🔥'.repeat(13))).toBe(false);
    });
  });

  describe('정규화', () => {
    it('분해된 한글(NFD)을 NFC로 합쳐 같은 값으로 만든다', () => {
      const decomposed = '승욱'.normalize('NFD');

      expect(decomposed).not.toBe('승욱');
      expect(normalizeNickname(decomposed)).toBe('승욱');
      expect(isValidNickname(decomposed)).toBe(true);
    });

    it('중복 비교 키는 대소문자를 무시한다', () => {
      expect(nicknameKey('Pacer')).toBe(nicknameKey('pacer'));
      expect(nicknameKey(' PACER ')).toBe('pacer');
    });
  });

  describe('assertValidNickname', () => {
    it('규칙 위반은 422로 막는다', () => {
      expect(() => assertValidNickname('승욱!')).toThrow(AppException);

      try {
        assertValidNickname('승욱!');
      } catch (error) {
        const e = error as AppException;
        expect(e.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(e.code).toBe('INVALID_NICKNAME');
      }
    });

    it('길이와 문자 위반의 안내 문구가 다르다', () => {
      const lengthMessage = catchMessage(() => assertValidNickname('김'));
      const charsetMessage = catchMessage(() => assertValidNickname('승욱!'));

      expect(lengthMessage).toContain('2~12자');
      expect(charsetMessage).toContain('이모지');
    });
  });
});

function catchMessage(run: () => unknown): string {
  try {
    run();
    return '';
  } catch (error) {
    return (error as AppException).message;
  }
}
