import { Response } from 'express';

/** 델타 1개의 문자 수 — 앱에서 타이핑처럼 보이도록 짧게 끊는다. */
const DELTA_SIZE = 12;

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // 프록시(nginx) 버퍼링으로 스트림이 뭉치지 않게 한다.
  'X-Accel-Buffering': 'no',
} as const;

export function openSseStream(res: Response): void {
  res.writeHead(200, SSE_HEADERS);
}

/** API 명세 §8 이벤트 포맷: `event: <name>` + `data: <json>`. */
export function writeSseEvent(
  res: Response,
  event: string,
  data: Record<string, unknown>,
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * 완성된 발화를 델타로 쪼갠다.
 * 마일스톤 1의 엔진은 완성 문장을 한 번에 돌려주므로 서버가 나눠서 흘리고,
 * 마일스톤 2에서 LLM 토큰 스트림으로 대체한다(클라이언트 계약은 동일).
 */
export function toDeltas(content: string, size: number = DELTA_SIZE): string[] {
  const deltas: string[] = [];
  for (let index = 0; index < content.length; index += size) {
    deltas.push(content.slice(index, index + size));
  }
  return deltas;
}
