/**
 * King LMS MAIN ワールドの fetch / XHR フック。
 * コース一覧・calendarItems を同一タブの `king-lms-bridge` へ `postMessage` する。
 */

import {
  assignmentSyncCalendarRange,
  calendarItemsToDueItems,
  mergeDueItems,
} from '../lib/calendar-items-to-due-items';
import { enrichDueItemsWithSubmissionStatus } from '../lib/gradebook-submission-status';
import { appendKingLmsApiCapture, isKingLmsApiUrl } from '../lib/king-lms-api-capture';
import { normalizeCalendarItemsResponse } from '../lib/king-lms-calendar-response';
import type { DueItem } from '../ui/calendar/assignment';
import { KING_LMS_HOOK } from '../contract/messages';
import { KING_LMS_HOSTNAME, KING_LMS_ORIGIN } from '../contract/origins';
import { TIMING } from '../contract/timing';
import { parseMembershipsResponse } from '../domain/king-lms/memberships';
import {
  isKingLmsCalendarItemsUrl,
  isKingLmsCalendarPage,
  isKingLmsMembershipsUrl,
  KING_LMS_CALENDAR_ITEMS_PATH,
} from '../domain/king-lms/urls';

let collectedDueItems: DueItem[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let wideFetchStarted = false;
let wideFetchSettled = false;
let wideFetchFailed = false;
let assignmentFlushDone = false;
let kingLmsOrigFetch: typeof fetch = (...args) => fetch(...args);

function resetAssignmentCollection(): void {
  collectedDueItems = [];
  wideFetchStarted = false;
  wideFetchSettled = false;
  wideFetchFailed = false;
  assignmentFlushDone = false;
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function ingestCalendarItems(json: unknown): void {
  const rows = normalizeCalendarItemsResponse(json);
  if (rows === null) {
    if (collectedDueItems.length === 0 && wideFetchSettled) notifyAssignmentFailure();
    return;
  }
  const due = calendarItemsToDueItems(rows);
  if (due.length > 0) collectedDueItems.push(...due);
  scheduleAssignmentFlush();
}

function scheduleAssignmentFlush(): void {
  if (assignmentFlushDone) return;
  if (flushTimer != null) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAssignmentDue();
  }, TIMING.kingLmsCalendarFlushDebounceMs);
}

async function flushAssignmentDue(): Promise<void> {
  if (assignmentFlushDone) return;
  if (isKingLmsCalendarPage() && wideFetchStarted && !wideFetchSettled) {
    scheduleAssignmentFlush();
    return;
  }

  const merged = mergeDueItems(collectedDueItems);
  assignmentFlushDone = true;
  if (merged.length === 0) {
    if (wideFetchFailed) notifyAssignmentFailure();
    else postAssignmentDue([], Date.now(), { assignmentSyncNoOp: true });
    return;
  }
  await enrichAndPostAssignmentDue(merged);
}

function startWideCalendarFetch(origFetch: typeof fetch): void {
  if (!isKingLmsCalendarPage() || wideFetchStarted) return;
  wideFetchStarted = true;
  const { since, until } = assignmentSyncCalendarRange();
  const url = `${KING_LMS_ORIGIN}${KING_LMS_CALENDAR_ITEMS_PATH}?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`;
  void origFetch(url)
    .then((r) => {
      wideFetchSettled = true;
      if (!r.ok) {
        wideFetchFailed = true;
        return;
      }
      return r
        .json()
        .then(ingestCalendarItems)
        .catch(() => {
          wideFetchFailed = true;
        });
    })
    .catch(() => {
      wideFetchSettled = true;
      wideFetchFailed = true;
    });
}

function handleMemberships(json: unknown): void {
  const courses = parseMembershipsResponse(json);
  if (courses === null) return;
  try {
    window.postMessage(
      { type: KING_LMS_HOOK.coursesPostType, source: KING_LMS_HOOK.source, courses },
      '*',
    );
  } catch (error) {
    void error;
  }
}

function postAssignmentDue(
  items: DueItem[],
  capturedAt: number,
  extra?: {
    captureState?: 'error';
    assignmentSyncNoOp?: boolean;
  },
): void {
  try {
    window.postMessage(
      {
        type: KING_LMS_HOOK.assignmentDuePostType,
        source: KING_LMS_HOOK.source,
        items,
        capturedAt,
        ...extra,
      },
      '*',
    );
  } catch (error) {
    void error;
  }
}

function notifyAssignmentFailure(): void {
  postAssignmentDue([], Date.now(), { captureState: 'error' });
}

async function enrichAndPostAssignmentDue(items: DueItem[]): Promise<void> {
  const enriched = await enrichDueItemsWithSubmissionStatus(items, kingLmsOrigFetch);
  postAssignmentDue(enriched, Date.now());
}

function maybeCaptureApiResponse(url: string, json: unknown): void {
  if (!isKingLmsApiUrl(url)) return;
  appendKingLmsApiCapture(url, json);
}

function hookFetchResponse(url: string, p: Promise<Response>): void {
  if (isKingLmsApiUrl(url)) {
    p.then((r) => {
      if (!r.ok) return;
      r.clone()
        .json()
        .then((j) => maybeCaptureApiResponse(url, j))
        .catch(() => {});
    }).catch(() => {});
  }
  if (isKingLmsMembershipsUrl(url)) {
    p.then((r) =>
      r
        .clone()
        .json()
        .then(handleMemberships)
        .catch(() => {}),
    ).catch(() => {});
  }
  if (isKingLmsCalendarItemsUrl(url)) {
    p.then((r) => {
      if (!r.ok) {
        if (collectedDueItems.length === 0 && wideFetchSettled) notifyAssignmentFailure();
        return;
      }
      r.clone()
        .json()
        .then(ingestCalendarItems)
        .catch(() => {
          if (collectedDueItems.length === 0 && wideFetchSettled) notifyAssignmentFailure();
        });
    }).catch(() => {
      if (collectedDueItems.length === 0 && wideFetchSettled) notifyAssignmentFailure();
    });
  }
}

function hookXhrResponse(xhr: XMLHttpRequest, url: string): void {
  if (isKingLmsApiUrl(url)) {
    xhr.addEventListener('load', function () {
      try {
        if (this.status < 200 || this.status >= 300) return;
        maybeCaptureApiResponse(url, JSON.parse(this.responseText));
      } catch (error) {
        void error;
      }
    });
  }
  if (isKingLmsMembershipsUrl(url)) {
    xhr.addEventListener('load', function () {
      try {
        handleMemberships(JSON.parse(this.responseText));
      } catch (error) {
        void error;
      }
    });
  }
  if (isKingLmsCalendarItemsUrl(url)) {
    xhr.addEventListener('load', function () {
      try {
        if (this.status < 200 || this.status >= 300) {
          if (collectedDueItems.length === 0 && wideFetchSettled) notifyAssignmentFailure();
          return;
        }
        ingestCalendarItems(JSON.parse(this.responseText));
      } catch {
        if (collectedDueItems.length === 0 && wideFetchSettled) notifyAssignmentFailure();
      }
    });
  }
}

function notifyLoginRedirect(): void {
  try {
    if (location.hostname !== KING_LMS_HOSTNAME) return;
    const path = location.pathname ?? '';
    if (path !== '/' && path !== '') return;
    if (!new URLSearchParams(location.search).has('new_loc')) return;
    window.postMessage(
      { type: KING_LMS_HOOK.syncAbortType, source: KING_LMS_HOOK.source, reason: 'loginRedirect' },
      '*',
    );
  } catch (error) {
    void error;
  }
}

function patchHistory(methodName: 'pushState' | 'replaceState', origFetch: typeof fetch): void {
  const orig = history[methodName];
  if (typeof orig !== 'function') return;
  history[methodName] = function () {
    const ret = orig.apply(this, arguments as unknown as Parameters<typeof orig>);
    notifyLoginRedirect();
    if (isKingLmsCalendarPage() && !wideFetchStarted) startWideCalendarFetch(origFetch);
    return ret;
  };
}

export function installKingLmsHook(): void {
  const origFetch = window.fetch.bind(window);
  kingLmsOrigFetch = origFetch;

  window.fetch = function (input, init) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? String(input)
          : input instanceof Request
            ? input.url
            : '';

    const p = origFetch.apply(this, [input, init] as Parameters<typeof fetch>);
    hookFetchResponse(url, p);
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL) {
    (this as XMLHttpRequest & { _kingLmsUrl?: string })._kingLmsUrl = String(url);
    return origOpen.apply(this, arguments as unknown as Parameters<typeof origOpen>);
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    const self = this as XMLHttpRequest & { _kingLmsUrl?: string };
    const u = String(self._kingLmsUrl ?? '');
    hookXhrResponse(self, u);
    return origSend.apply(this, arguments as unknown as Parameters<typeof origSend>);
  };

  if (isKingLmsCalendarPage()) {
    resetAssignmentCollection();
    startWideCalendarFetch(origFetch);
  }

  notifyLoginRedirect();
  patchHistory('pushState', origFetch);
  patchHistory('replaceState', origFetch);
  window.addEventListener('popstate', notifyLoginRedirect);
}
