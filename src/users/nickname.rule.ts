import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';

/**
 * 닉네임 규칙 (기능명세 US-1.2).
 *
 * - 허용: 한글 완성형 · 영문 · 숫자 · 이모지
 * - 길이: 2~12자. 이모지는 여러 코드포인트가 합쳐지므로 **grapheme cluster** 기준으로 센다
 *   (가족 이모지 👨‍👩‍👧‍👦, 피부톤 👍🏽, 국기 🇰🇷 모두 1자).
 * - 불가: 공백, 특수문자, 자음/모음 단독(ㅋㅋ·ㅜㅜ)
 * - 저장 전 NFC 정규화 + trim → 같은 글자가 다른 바이트로 저장되는 것을 막는다.
 *
 * 앱(`pacer_app`)의 `nickname_rule.dart`와 판정이 일치해야 한다.
 */

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 12;

/** 한글 완성형 · 영문 · 숫자 (자음/모음 단독은 제외) */
const PLAIN_CHARACTER = /^[가-힣a-zA-Z0-9]$/u;

/** 이모지 본체 */
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

/** 국기(지역 표시 문자) — Extended_Pictographic에 포함되지 않아 따로 본다. */
const REGIONAL_INDICATOR = /[\u{1F1E6}-\u{1F1FF}]/u;

const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });

/** 문자열을 사람이 세는 단위(grapheme cluster)로 쪼갠다. */
export function toGraphemes(value: string): string[] {
  return Array.from(segmenter.segment(value), (part) => part.segment);
}

function isEmoji(grapheme: string): boolean {
  return PICTOGRAPHIC.test(grapheme) || REGIONAL_INDICATOR.test(grapheme);
}

function isAllowed(grapheme: string): boolean {
  return PLAIN_CHARACTER.test(grapheme) || isEmoji(grapheme);
}

/** 저장·비교에 쓰는 정본 형태 (NFC 정규화 + 앞뒤 공백 제거). */
export function normalizeNickname(value: string): string {
  return value.normalize('NFC').trim();
}

/** 중복 비교용 키 — 대소문자를 무시한다. */
export function nicknameKey(value: string): string {
  return normalizeNickname(value).toLowerCase();
}

export type NicknameViolation = 'LENGTH' | 'CHARSET';

/** 규칙 위반 사유를 돌려준다. 통과하면 null. */
export function findNicknameViolation(value: string): NicknameViolation | null {
  const graphemes = toGraphemes(normalizeNickname(value));

  if (
    graphemes.length < NICKNAME_MIN_LENGTH ||
    graphemes.length > NICKNAME_MAX_LENGTH
  ) {
    return 'LENGTH';
  }
  return graphemes.every(isAllowed) ? null : 'CHARSET';
}

export function isValidNickname(value: string): boolean {
  return findNicknameViolation(value) === null;
}

/**
 * 정규화된 닉네임을 돌려주고, 규칙에 어긋나면 422로 막는다.
 * 사용자에게는 어떤 규칙을 어겼는지 알려준다.
 */
export function assertValidNickname(value: string): string {
  const violation = findNicknameViolation(value);
  if (violation === null) return normalizeNickname(value);

  throw new AppException(
    'INVALID_NICKNAME',
    violation === 'LENGTH'
      ? `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 입력해주세요.`
      : '닉네임에는 한글·영문·숫자·이모지만 쓸 수 있어요.',
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}
