import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 대시보드 HTML.
 *
 * 별도 파일로 두고 빌드 시 dist로 복사한다(nest-cli assets) — TS 템플릿 문자열에
 * 넣으면 `${`·백틱을 전부 이스케이프해야 해서 편집이 어려워진다.
 */
export const DASHBOARD_HTML = readFileSync(
  join(__dirname, 'dashboard.html'),
  'utf-8',
);
