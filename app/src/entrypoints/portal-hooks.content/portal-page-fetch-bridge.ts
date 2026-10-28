/**
 * オーバーレイからの `pageFetch` メッセージに応じ、キャプチャしたヘッダー付きで `fetch` を実行します。
 * 401 のときは短い間隔で最大 10 回まで再試行します。
 * `X-CPAuthorize` は `PORTAL_CP_AUTHORIZE_READY` イベントと疎なポーリングの両方で待機解除します。
 */

import { devWarn } from '../../lib/debug';
import { FETCH_HOOK, PORTAL_CP_AUTHORIZE_READY } from '../../contract/messages';
import { pageFetchRetryDelayMs, TIMING } from '../../contract/timing';
import { hasPortalCpAuthorizeHeaders } from './portal-header-cache';

type PortalApiMethod = 'GET' | 'POST';

interface PortalApiRequestMessage {
  type: typeof FETCH_HOOK.portalApiRequest;
  id: string;
  method: PortalApiMethod;
  url: string;
  body?: string;
}

function postPortalApiResponse(id: string, ok: boolean, status: number, json: unknown): void {
  window.postMessage(
    {
      type: FETCH_HOOK.portalApiResponse,
      source: FETCH_HOOK.source,
      id,
      ok,
      status,
      json,
    },
    '*',
  );
}

export function installFetchBridge(): void {
  const BASE_HEADERS: Record<string, string> = {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Requested-With': 'XMLHttpRequest',
  };

  function doFetch(url: string, attempt: number): void {
    const headers = { ...BASE_HEADERS, ...(window.__portalCapturedApiHeaders ?? {}) };
    fetch(url, { credentials: 'include', cache: 'no-store', headers })
      .then((response) => {
        if (response.status === 401 && attempt < TIMING.pageFetchMaxAttempts) {
          const delay = pageFetchRetryDelayMs(attempt);
          setTimeout(() => doFetch(url, attempt + 1), delay);
        }
      })
      .catch((err) => {
        devWarn('portal-hooks: pageFetch bridge failed', url, err);
      });
  }

  function doPortalApi(
    id: string,
    method: PortalApiMethod,
    url: string,
    body: string | undefined,
    attempt: number,
  ): void {
    const headers = { ...BASE_HEADERS, ...(window.__portalCapturedApiHeaders ?? {}) };
    fetch(url, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers,
      body: method === 'POST' ? body : undefined,
    })
      .then(async (response) => {
        if (response.status === 401 && attempt < TIMING.pageFetchMaxAttempts) {
          const delay = pageFetchRetryDelayMs(attempt);
          setTimeout(() => doPortalApi(id, method, url, body, attempt + 1), delay);
          return;
        }
        let json: unknown;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        postPortalApiResponse(id, response.ok, response.status, json);
      })
      .catch((err) => {
        devWarn('portal-hooks: portal API bridge failed', url, err);
        postPortalApiResponse(id, false, 0, null);
      });
  }

  function waitAndFetch(url: string): void {
    if (hasPortalCpAuthorizeHeaders()) {
      doFetch(url, 0);
      return;
    }
    const deadline = Date.now() + TIMING.pageFetchDeadlineMs;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let finished = false;

    const cleanup = () => {
      window.removeEventListener(PORTAL_CP_AUTHORIZE_READY, onReady);
      if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };

    const done = () => {
      if (finished) return;
      finished = true;
      cleanup();
      doFetch(url, 0);
    };

    const onReady = () => done();

    window.addEventListener(PORTAL_CP_AUTHORIZE_READY, onReady);

    function poll(): void {
      if (hasPortalCpAuthorizeHeaders() || Date.now() >= deadline) {
        done();
        return;
      }
      pollTimer = setTimeout(poll, TIMING.pageFetchPollMs);
    }
    poll();
  }

  function waitAndPortalApi(id: string, method: PortalApiMethod, url: string, body?: string): void {
    const run = () => doPortalApi(id, method, url, body, 0);
    if (hasPortalCpAuthorizeHeaders()) {
      run();
      return;
    }
    const deadline = Date.now() + TIMING.pageFetchDeadlineMs;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let finished = false;

    const cleanup = () => {
      window.removeEventListener(PORTAL_CP_AUTHORIZE_READY, onReady);
      if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };

    const done = () => {
      if (finished) return;
      finished = true;
      cleanup();
      run();
    };

    const onReady = () => done();
    window.addEventListener(PORTAL_CP_AUTHORIZE_READY, onReady);

    function poll(): void {
      if (hasPortalCpAuthorizeHeaders() || Date.now() >= deadline) {
        done();
        return;
      }
      pollTimer = setTimeout(poll, TIMING.pageFetchPollMs);
    }
    poll();
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (!e.data) return;

    if (e.data.type === FETCH_HOOK.pageFetch) {
      const url = e.data.url;
      if (url) waitAndFetch(String(url));
      return;
    }

    if (e.data.type === FETCH_HOOK.portalApiRequest) {
      const msg = e.data as PortalApiRequestMessage;
      if (!msg.id || !msg.url) return;
      const method: PortalApiMethod = msg.method === 'POST' ? 'POST' : 'GET';
      waitAndPortalApi(msg.id, method, String(msg.url), msg.body);
    }
  });
}
