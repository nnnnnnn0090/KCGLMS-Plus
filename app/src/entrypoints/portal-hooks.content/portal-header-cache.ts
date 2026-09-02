/**
 * ポータル API リクエストから認証関連ヘッダーを `window.__portalCapturedApiHeaders` に保持します。
 * `pageFetch` ブリッジが再リクエストするときに参照されます。
 * `X-CPAuthorize` が揃ったタイミングで `PORTAL_CP_AUTHORIZE_READY` を発火し、ポーリング待機を減らします。
 */

import { isPortalApiUrl } from '../../lib/api-paths';
import { PORTAL_CP_AUTHORIZE_READY } from '../../shared/constants';

const CAPTURE_HEADERS = ['X-CPAuthorize', 'X-Requested-With', 'Content-Type', 'Accept'];

export function hasPortalCpAuthorizeHeaders(): boolean {
  const cap = window.__portalCapturedApiHeaders;
  if (!cap) return false;
  return Object.keys(cap).some((k) => k.toLowerCase() === 'x-cpauthorize' && cap[k]);
}

function notifyCpAuthorizeReadyIfPresent(): void {
  if (!hasPortalCpAuthorizeHeaders()) return;
  window.dispatchEvent(new CustomEvent(PORTAL_CP_AUTHORIZE_READY));
}

export function captureHeaders(url: string, headers: HeadersInit | undefined): void {
  if (!isPortalApiUrl(url) || !headers) return;
  try {
    const h = new Headers(headers);
    const cap = (window.__portalCapturedApiHeaders ??= {});
    for (const k of CAPTURE_HEADERS) {
      const v = h.get(k);
      if (v) cap[k] = v;
    }
  } catch {
    /* 不正な Headers 等は無視 */
  }
  notifyCpAuthorizeReadyIfPresent();
}

export function captureXhrHeader(url: string, name: string, value: string): void {
  if (!isPortalApiUrl(url)) return;
  if (!['x-cpauthorize', 'x-requested-with', 'content-type', 'accept'].includes(name.toLowerCase()))
    return;
  (window.__portalCapturedApiHeaders ??= {})[name] = value;
  notifyCpAuthorizeReadyIfPresent();
}
