/**
 * ポータル公式 API の URL 組み立てと、`pageFetch` による認証付き再取得のユーティリティです。
 * 再取得は `postMessage` で `portal-hooks`（MAIN）側のブリッジへ依頼します。
 */

import { PORTAL_API } from './api-paths';
import type { CalParams } from '../ui/calendar/types';

export type { CalParams };

export { pageFetch } from '../services/page-fetch';

// ─── URL ビルダー ─────────────────────────────────────────────────────────

function calUrl(endpoint: string, params: CalParams): string {
  const u = new URL(`/portal/api/${endpoint}/`, location.origin);
  u.searchParams.set('uKbn', params.uKbn);
  u.searchParams.set('start', params.start);
  u.searchParams.set('end', params.end);
  return u.href;
}

/** ポータル素 HTML の #lastLoginDt（API の lastLogin クエリ用・前後空白のみ除去） */
export function portalLastLoginRaw(): string {
  return (document.getElementById('lastLoginDt')?.textContent ?? '').trim();
}

/** ヘッダー表示用（連続空白を 1 つに畳む） */
export function portalLastLoginCollapsed(): string {
  return (document.getElementById('lastLoginDt')?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export const urls = {
  kogiCalendar: (p: CalParams) => calUrl(PORTAL_API.kogiCalendar, p),
  hoshuCalendar: (p: CalParams) => calUrl(PORTAL_API.hoshuCalendar, p),
  campusCalendar: (p: CalParams) => calUrl(PORTAL_API.campusCalendar, p),

  kogiNews(): string {
    const u = new URL(`/portal/api/${PORTAL_API.kogiNews}/`, location.origin);
    const ll = portalLastLoginRaw();
    if (ll) u.searchParams.set('lastLogin', ll);
    return u.href;
  },

  deliveredNendo(nendo: string | number, lastLogin: string): string {
    const u = new URL(
      `/portal/api/${PORTAL_API.deliveredNews}/Nendo/${encodeURIComponent(String(nendo))}/`,
      location.origin,
    );
    const ll = String(lastLogin ?? '').trim();
    if (ll) u.searchParams.set('lastLogin', ll);
    return u.href;
  },

  deliveredDetail: (id: string | number) =>
    new URL(
      `/portal/api/${PORTAL_API.deliveredNews}/${encodeURIComponent(String(id))}/`,
      location.origin,
    ).href,

  kyukoInfo: (nendo: string | number) => {
    const u = new URL(`/portal/api/${PORTAL_API.kyukoInfo}`, location.origin);
    u.searchParams.set('nendo', String(nendo));
    return u.href;
  },

  hokoInfo: (nendo: string | number) => {
    const u = new URL(`/portal/api/${PORTAL_API.hokoInfo}`, location.origin);
    u.searchParams.set('nendo', String(nendo));
    return u.href;
  },

  kyoshitsuChange: (nendo: string | number) => {
    const u = new URL(`/portal/api/${PORTAL_API.kyoshitsuChange}`, location.origin);
    u.searchParams.set('nendo', String(nendo));
    return u.href;
  },

  questionnaireInfo: () =>
    new URL(`/portal/api/${PORTAL_API.questionnaireInfo}`, location.origin).href,

  /** ホーム表示用（kubun=0 公式 + kubun=1 ユーザー） */
  userHtmlLink: () => new URL('/portal/api/UserHtmlLink/', location.origin).href,

  /** プロフィール「マイリンク」一覧（id / version 付き） */
  userHtmlLinkMe: () => new URL('/portal/api/UserHtmlLink/Me/', location.origin).href,

  /** プロフィール画面と同じ保存 API */
  updateUserHtmlLink: () => new URL('/portal/api/UserProfile/UpUserLink/', location.origin).href,
};

// ─── カレンダー URL パース ─────────────────────────────────────────────────

/** カレンダー API のリクエスト URL から { uKbn, start, end } を取り出す */
export function parseCalendarRequest(href: string): CalParams | null {
  try {
    const abs = /^https?:\/\//i.test(href);
    const u = abs ? new URL(href) : new URL(href, location.origin);
    const start = u.searchParams.get('start');
    const end = u.searchParams.get('end');
    const uKbn = u.searchParams.get('uKbn') ?? '1';
    if (!start || !end) return null;
    return { uKbn, start, end };
  } catch {
    return null;
  }
}
