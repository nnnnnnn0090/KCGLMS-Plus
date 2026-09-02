/**
 * `window.fetch` をラップし、フック対象のポータル API レスポンス JSON を `dispatch` へ渡します。
 * 同一タブ向けのリプレイ用 `message` リスナーもここで登録します。
 */

import { devWarn } from '../../lib/debug';
import { FETCH_HOOK } from '../../shared/constants';
import { dispatch, replayAllSentMessages } from './portal-hook-dispatch';
import { shouldHook } from './portal-hook-paths';
import { captureHeaders } from './portal-header-cache';

export function installFetchHook(): void {
  const origFetch = window.fetch;

  window.fetch = function (input, init) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? String(input)
          : input instanceof Request
            ? input.url
            : '';

    captureHeaders(url, init?.headers ?? (input instanceof Request ? input.headers : undefined));

    const p = origFetch.apply(this, [input, init] as Parameters<typeof fetch>);
    if (!shouldHook(url)) return p;

    return p.then((response) => {
      response
        .clone()
        .json()
        .then((json) => dispatch(url, json))
        .catch((err) => {
          devWarn('portal-hooks: response JSON parse failed', url, err);
        });
      return response;
    });
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (!e.data || e.data.type !== FETCH_HOOK.replayRequest) return;
    replayAllSentMessages();
  });
}
