/**
 * MAIN ワールドの portal-hooks ブリッジ経由で認証付き API を呼び出す。
 */

import { FETCH_HOOK } from '../contract/messages';
import { PORTAL_API_RESPONSE_DEADLINE_MS } from '../contract/timing';
import { postPortalApiRequest } from '../platform/messaging/page-bus';

export interface PortalApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  json: T;
}

function randomRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `portal-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function portalApiRequest<T = unknown>(
  method: 'GET' | 'POST',
  url: string,
  body?: unknown,
): Promise<PortalApiResponse<T>> {
  const id = randomRequestId();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('portal API request timed out'));
    }, PORTAL_API_RESPONSE_DEADLINE_MS);

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.type !== FETCH_HOOK.portalApiResponse) return;
      if (data.source !== FETCH_HOOK.source || data.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve({
        ok: Boolean(data.ok),
        status: typeof data.status === 'number' ? data.status : 0,
        json: data.json as T,
      });
    };

    window.addEventListener('message', onMessage);
    postPortalApiRequest({
      id,
      method,
      url,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  });
}
