/**
 * MAIN ワールド用 postMessage バス（§10.2）。
 */

import { FETCH_HOOK, KING_LMS_HOOK } from '../../contract/messages';
import { KING_LMS_ORIGIN } from '../../contract/origins';
import { isPageMessage, type PageMessage } from './types';

const TARGET_ORIGIN = '*';

export function postMainMessage(msg: PageMessage): void {
  try {
    window.postMessage(msg, TARGET_ORIGIN);
  } catch {
    /* ignore */
  }
}

export function postCapturedApi(
  type: PageMessage & { source: typeof FETCH_HOOK.source } extends { type: infer T } ? T : never,
  url: string,
  data: unknown,
): void {
  postMainMessage({ type, source: FETCH_HOOK.source, url, data } as PageMessage);
}

export function postKingLmsCourses(
  courses: Array<{ displayName: string | null; externalAccessUrl: string | null }>,
): void {
  postMainMessage({
    type: KING_LMS_HOOK.coursesPostType,
    source: KING_LMS_HOOK.source,
    courses,
  });
}

export function postKingLmsAssignmentDue(
  items: unknown[],
  capturedAt: number,
  extra?: { captureState?: 'error'; assignmentSyncNoOp?: boolean },
): void {
  postMainMessage({
    type: KING_LMS_HOOK.assignmentDuePostType,
    source: KING_LMS_HOOK.source,
    items,
    capturedAt,
    ...extra,
  } as PageMessage);
}

export function postKingLmsSyncAbort(reason?: string): void {
  postMainMessage({
    type: KING_LMS_HOOK.syncAbortType,
    source: KING_LMS_HOOK.source,
    reason,
  });
}

export function listenMainMessages(
  handler: (msg: PageMessage, event: MessageEvent) => void,
  options?: { requireKingLmsOrigin?: boolean },
): () => void {
  const listener = (event: MessageEvent) => {
    if (event.source !== window) return;
    if (options?.requireKingLmsOrigin && event.origin !== KING_LMS_ORIGIN) return;
    if (!isPageMessage(event.data)) return;
    handler(event.data, event);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
