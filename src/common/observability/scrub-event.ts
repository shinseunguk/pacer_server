import type { ErrorEvent } from '@sentry/nestjs';

/**
 * Sentry로 나가는 이벤트에서 민감 정보를 걷어낸다.
 *
 * 이 서비스는 요청 본문에 **면접 답변·자기소개·공고 원문**이 담긴다 (민감 개인정보).
 * 필드 이름을 하나씩 지우는 방식은 DTO가 늘 때마다 빠뜨리기 쉬우므로,
 * **본문·쿼리는 통째로 버리고 헤더는 화이트리스트로만 남긴다.**
 */

/** 남겨도 되는 헤더 (디버깅에 필요하고 개인정보가 아닌 것만). */
const ALLOWED_HEADERS = new Set([
  'content-type',
  'content-length',
  'user-agent',
  'accept',
  'accept-language',
]);

/** 본문을 통째로 버리므로 여기에 없는 필드도 자동으로 안전하다. */
const REDACTED = '[redacted]';

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;

  if (request) {
    // 본문·쿼리에 답변 원문이 들어온다 — 통째로 버린다.
    if (request.data !== undefined) request.data = REDACTED;
    if (request.query_string !== undefined) request.query_string = REDACTED;

    // URL에 붙은 쿼리스트링도 함께 잘라낸다.
    if (typeof request.url === 'string') {
      request.url = request.url.split('?')[0];
    }

    request.headers = filterHeaders(request.headers);
    request.cookies = undefined;
  }

  // 사용자 식별은 내부 id만. 이메일·닉네임은 보내지 않는다.
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }

  // 임의로 붙은 컨텍스트에도 원문이 섞일 수 있다.
  event.extra = undefined;

  event.breadcrumbs = event.breadcrumbs?.map((crumb) => ({
    ...crumb,
    data: undefined,
  }));

  return event;
}

function filterHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;

  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (ALLOWED_HEADERS.has(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  return filtered;
}
