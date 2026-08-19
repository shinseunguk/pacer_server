import type { ErrorEvent } from '@sentry/nestjs';
import { scrubEvent } from './scrub-event';

/** 실제 요청 본문에 담기는 민감 원문 — 하나라도 새어나가면 안 된다. */
const RESUME = '3년간 결제 서버를 담당하며 응답 지연을 40% 줄였습니다.';
const JOB_POSTING = '주요 업무: 결제 서버 API 개발 및 운영';
const ANSWER = '캐시 무효화는 TTL과 이벤트 기반을 함께 썼습니다.';

function eventWith(overrides: Partial<ErrorEvent>): ErrorEvent {
  return { event_id: 'e1', ...overrides } as ErrorEvent;
}

/** 직렬화한 이벤트 전체에서 문자열을 찾는다 — 어느 경로로 새든 잡힌다. */
function contains(event: ErrorEvent, needle: string): boolean {
  return JSON.stringify(event).includes(needle);
}

describe('scrubEvent', () => {
  it('요청 본문을 통째로 버린다', () => {
    const event = eventWith({
      request: {
        method: 'POST',
        url: 'https://api.pacer.app/v1/interviews',
        data: {
          jobPostingText: JOB_POSTING,
          applicantInfo: RESUME,
          content: ANSWER,
        },
      },
    });

    const scrubbed = scrubEvent(event);

    expect(contains(scrubbed, JOB_POSTING)).toBe(false);
    expect(contains(scrubbed, RESUME)).toBe(false);
    expect(contains(scrubbed, ANSWER)).toBe(false);
    expect(scrubbed.request?.data).toBe('[redacted]');
  });

  it('DTO에 새 필드가 생겨도 안전하다 (필드 목록에 의존하지 않는다)', () => {
    const event = eventWith({
      request: { data: { someFutureSensitiveField: RESUME } },
    });

    expect(contains(scrubEvent(event), RESUME)).toBe(false);
  });

  it('쿼리스트링과 URL의 쿼리 부분을 지운다', () => {
    const event = eventWith({
      request: {
        url:
          'https://api.pacer.app/v1/interviews?q=' + encodeURIComponent(RESUME),
        query_string: 'q=' + encodeURIComponent(RESUME),
      },
    });

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request?.url).toBe('https://api.pacer.app/v1/interviews');
    expect(scrubbed.request?.query_string).toBe('[redacted]');
  });

  it('인증 헤더와 쿠키를 남기지 않는다', () => {
    const event = eventWith({
      request: {
        headers: {
          authorization: 'Bearer secret-token',
          cookie: 'session=abc',
          'content-type': 'application/json',
          'user-agent': 'Dart/3.8 (dart:io)',
        },
        cookies: { session: 'abc' },
      },
    });

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request?.headers).toEqual({
      'content-type': 'application/json',
      'user-agent': 'Dart/3.8 (dart:io)',
    });
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(contains(scrubbed, 'secret-token')).toBe(false);
  });

  it('헤더 이름의 대소문자와 무관하게 걸러낸다', () => {
    const event = eventWith({
      request: {
        headers: { Authorization: 'Bearer x', 'Content-Type': 'a/b' },
      },
    });

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request?.headers).toEqual({ 'Content-Type': 'a/b' });
  });

  it('사용자는 내부 id만 남기고 이메일·닉네임은 버린다', () => {
    const event = eventWith({
      user: { id: 'user-1', email: 'me@test.com', username: '승욱' },
    });

    const scrubbed = scrubEvent(event);

    expect(scrubbed.user).toEqual({ id: 'user-1' });
  });

  it('extra와 breadcrumb 데이터를 비운다', () => {
    const event = eventWith({
      extra: { answer: ANSWER },
      breadcrumbs: [{ message: 'http', data: { body: ANSWER } }],
    });

    const scrubbed = scrubEvent(event);

    expect(scrubbed.extra).toBeUndefined();
    expect(scrubbed.breadcrumbs?.[0].data).toBeUndefined();
    expect(scrubbed.breadcrumbs?.[0].message).toBe('http');
    expect(contains(scrubbed, ANSWER)).toBe(false);
  });

  it('request가 없는 이벤트도 처리한다', () => {
    expect(() => scrubEvent(eventWith({}))).not.toThrow();
  });
});
