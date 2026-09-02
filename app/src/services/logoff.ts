/**
 * 学ポータル本体 DOM のログアウト（`li.logoff`）。`javascript:` / PostBack は MAIN ワールドで実行する。
 */

import { FETCH_HOOK } from '../contract/messages';
import { PORTAL_DOM } from '../contract/dom';
import { postLogoffTrigger } from '../platform/messaging/page-bus';

/** 拡張オーバーレイ外の `li.logoff` 内アンカー */
export function findHostLogoffAnchor(
  overlayRootId = PORTAL_DOM.overlayRoot,
): HTMLAnchorElement | null {
  for (const li of document.querySelectorAll('li.logoff')) {
    if (!(li instanceof HTMLElement)) continue;
    if (li.closest(`#${overlayRootId}`)) continue;
    const a = li.querySelector('a');
    if (a instanceof HTMLAnchorElement) return a;
  }
  return null;
}

const DO_POST_BACK_RE = /__doPostBack\s*\(\s*(['"])(.*?)\1\s*,\s*(['"])(.*?)\3\s*\)/;

type WindowWithPostBack = Window & {
  __doPostBack?: (eventTarget: string, eventArgument: string) => void;
};

/** ASP.NET WebForms の `__doPostBack('target','arg')` をページ本体の関数で実行 */
export function tryDoPostBackFromScript(code: string): boolean {
  const m = code.match(DO_POST_BACK_RE);
  if (!m) return false;
  const fn = (window as WindowWithPostBack).__doPostBack;
  if (typeof fn !== 'function') return false;
  fn(m[2]!, m[4]!);
  return true;
}

function runInlineLogoutScript(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  if (tryDoPostBackFromScript(trimmed)) return true;
  try {
    new Function(trimmed)();
    return true;
  } catch {
    return false;
  }
}

/** `href` / `onclick` から PostBack 等を MAIN ワールドで実行 */
export function triggerHostLogoffAnchor(a: HTMLAnchorElement): void {
  const rawHref = a.getAttribute('href')?.trim() ?? '';
  if (rawHref && rawHref !== '#' && !rawHref.toLowerCase().startsWith('javascript:')) {
    try {
      const u = new URL(rawHref, location.href);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        window.location.assign(u.href);
        return;
      }
    } catch {
      /* fall through */
    }
  }

  const onclick = a.getAttribute('onclick')?.trim() ?? '';
  if (onclick && runInlineLogoutScript(onclick)) return;

  if (rawHref.toLowerCase().startsWith('javascript:')) {
    const body = rawHref.slice(rawHref.indexOf(':') + 1);
    if (runInlineLogoutScript(body)) return;
  }

  a.click();
}

/** 隔離ワールド（オーバーレイ UI）から MAIN ワールドへログアウトを委譲 */
export function requestHostPortalLogoff(): void {
  postLogoffTrigger();
}

export { FETCH_HOOK };
