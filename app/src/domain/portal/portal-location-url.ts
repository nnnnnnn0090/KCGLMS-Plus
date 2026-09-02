/**
 * 学ポータル上の `location` / `history` URL を正規化する。
 * ルート判定（router.ts）とは責務を分離し、アドレスバーと戻り先 URL の補正だけを担う。
 */

import { PORTAL_HOSTNAME } from '../../contract/origins';

/** ルート判定用: 末尾スラッシュを除き、空は `/portal` とみなす */
export function normalizePortalPathname(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/portal';
}

/** アドレスバー用: ポータルホームは常に `/portal/` を使う */
export function canonicalPortalPathname(pathname: string): string {
  const normalized = normalizePortalPathname(pathname);
  if (normalized === '/portal' || normalized === '/') return '/portal/';
  return pathname;
}

/** 現在の URL がポータルホーム相当か（`/portal` またはサイトルート `/`） */
export function isPortalHomePathname(pathname = location.pathname): boolean {
  const normalized = normalizePortalPathname(pathname);
  return normalized === '/portal' || normalized === '/';
}

const LEGACY_CONTACT_FORM_CATEGORIES = new Set(['bug', 'feature', 'account', 'community', 'other']);

/** 旧実装の HTML フォーム GET 漏れで付いたクエリを除去する */
function stripLegacyPortalFormSearchParams(url: URL): void {
  const category = url.searchParams.get('category');
  if (category && LEGACY_CONTACT_FORM_CATEGORIES.has(category)) {
    url.searchParams.delete('category');
    url.searchParams.delete('subject');
    url.searchParams.delete('message');
    return;
  }

  if (
    isPortalHomePathname(url.pathname) &&
    url.searchParams.has('message') &&
    url.searchParams.size === 1
  ) {
    url.searchParams.delete('message');
  }
}

/** ポータル origin 上の URL をアドレスバー用に正規化する */
export function sanitizePortalLocationUrl(url: URL): void {
  if (url.hostname !== PORTAL_HOSTNAME) return;
  stripLegacyPortalFormSearchParams(url);
  url.pathname = canonicalPortalPathname(url.pathname);
}

export function isPortalLocationUrl(url: URL): boolean {
  return url.hostname === PORTAL_HOSTNAME;
}

/** `history.replaceState` 用の正規化済み path + search（+ hash 任意） */
export function buildPortalHistoryUrl(href: string = location.href, includeHash = false): string {
  const url = new URL(href);
  sanitizePortalLocationUrl(url);
  return includeHash ? `${url.pathname}${url.search}${url.hash}` : `${url.pathname}${url.search}`;
}

/** ポータル origin 上の href を正規化する（戻り先 URL 保存など） */
export function canonicalPortalHref(href: string = location.href): string {
  try {
    const url = new URL(href);
    if (!isPortalLocationUrl(url)) return href;
    const before = url.href;
    sanitizePortalLocationUrl(url);
    return url.href === before ? href : url.href;
  } catch {
    return href;
  }
}

/** アドレスバーの URL が正規形でなければ `history.replaceState` で直す */
export function ensureCanonicalPortalUrl(): void {
  if (location.hostname !== PORTAL_HOSTNAME) return;
  const next = buildPortalHistoryUrl(location.href);
  const current = `${location.pathname}${location.search}`;
  if (next === current) return;
  try {
    history.replaceState(history.state, '', next);
  } catch {
    /* ignore */
  }
}
