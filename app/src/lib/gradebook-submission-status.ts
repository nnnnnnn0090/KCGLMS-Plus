/**
 * King LMS gradebook API から提出済みかを判定する。
 */

import { KING_LMS_ORIGIN } from '../shared/constants';
import type { DueItem } from '../ui/calendar/assignment';

/** 提出済みとみなす gradebook user status */
const SUBMITTED_STATUSES = new Set(['NeedsGrading', 'Graded', 'Completed', 'NeedsGradingAgain']);

/** 未提出とみなす gradebook user status */
const NOT_SUBMITTED_STATUSES = new Set(['InProgress', 'NotStarted', 'InProgressAgain']);

/** 提出済みとみなす attempt status */
const SUBMITTED_ATTEMPT_STATUSES = new Set([
  'NeedsGrading',
  'Graded',
  'Completed',
  'NeedsGradingAgain',
]);

const FETCH_RETRY_COUNT = 3;
const FETCH_RETRY_DELAY_MS = 400;

export function gradebookColumnUsersUrl(courseId: string, columnId: string): string {
  const cid = encodeURIComponent(courseId);
  const col = encodeURIComponent(columnId);
  return `${KING_LMS_ORIGIN}/learn/api/public/v2/courses/${cid}/gradebook/columns/${col}/users?limit=1`;
}

export function gradebookColumnAttemptsUrl(courseId: string, columnId: string): string {
  const cid = encodeURIComponent(courseId);
  const col = encodeURIComponent(columnId);
  return `${KING_LMS_ORIGIN}/learn/api/public/v2/courses/${cid}/gradebook/columns/${col}/attempts?limit=5`;
}

/** HTTP ステータスと JSON 本体から提出済みかを返す。users API 専用。 */
export function submissionFromGradebookUsersResponse(
  statusCode: number,
  json: unknown,
): boolean | undefined {
  if (statusCode === 404) {
    if (json && typeof json === 'object') {
      const code = String((json as Record<string, unknown>).code ?? '').trim();
      if (code === '-grade-detail-not-loaded') return false;
    }
    return false;
  }
  if (statusCode < 200 || statusCode >= 300) return undefined;
  if (!json || typeof json !== 'object') return undefined;

  const results = (json as Record<string, unknown>).results;
  if (!Array.isArray(results)) return undefined;
  if (results.length === 0) return false;

  const status = String((results[0] as Record<string, unknown>).status ?? '').trim();
  if (SUBMITTED_STATUSES.has(status)) return true;
  if (NOT_SUBMITTED_STATUSES.has(status)) return false;
  return undefined;
}

/** attempts API から提出済みかを返す。users が失敗したときのフォールバック。 */
export function submissionFromGradebookAttemptsResponse(
  statusCode: number,
  json: unknown,
): boolean | undefined {
  if (statusCode === 404) return false;
  if (statusCode < 200 || statusCode >= 300) return undefined;
  if (!json || typeof json !== 'object') return undefined;

  const results = (json as Record<string, unknown>).results;
  if (!Array.isArray(results)) return undefined;
  if (results.length === 0) return false;

  for (const row of results) {
    const status = String((row as Record<string, unknown>).status ?? '').trim();
    if (SUBMITTED_ATTEMPT_STATUSES.has(status)) return true;
    if (NOT_SUBMITTED_STATUSES.has(status)) continue;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readJsonSafe(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

async function fetchWithRetries(
  fetchFn: typeof fetch,
  url: string,
): Promise<{ status: number; json: unknown } | null> {
  for (let attempt = 0; attempt < FETCH_RETRY_COUNT; attempt++) {
    try {
      const r = await fetchFn(url);
      return { status: r.status, json: await readJsonSafe(r) };
    } catch {
      if (attempt < FETCH_RETRY_COUNT - 1) {
        await sleep(FETCH_RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  return null;
}

async function resolveSubmissionForColumn(
  fetchFn: typeof fetch,
  courseId: string,
  columnId: string,
): Promise<boolean> {
  const usersUrl = gradebookColumnUsersUrl(courseId, columnId);
  const attemptsUrl = gradebookColumnAttemptsUrl(courseId, columnId);

  const usersRes = await fetchWithRetries(fetchFn, usersUrl);
  if (usersRes) {
    const fromUsers = submissionFromGradebookUsersResponse(usersRes.status, usersRes.json);
    if (fromUsers !== undefined) return fromUsers;
  }

  const attemptsRes = await fetchWithRetries(fetchFn, attemptsUrl);
  if (attemptsRes) {
    const fromAttempts = submissionFromGradebookAttemptsResponse(
      attemptsRes.status,
      attemptsRes.json,
    );
    if (fromAttempts !== undefined) return fromAttempts;
  }

  return false;
}

/** calendarItems 由来 DueItem に gradebook 提出状態を付与する（常に boolean） */
export async function enrichDueItemsWithSubmissionStatus(
  items: DueItem[],
  fetchFn: typeof fetch,
  concurrency = 8,
): Promise<DueItem[]> {
  const statusByKey = new Map<string, boolean>();
  const pairs: Array<{ courseId: string; sourceId: string; key: string }> = [];

  for (const item of items) {
    const courseId = String(item.courseId ?? '').trim();
    const sourceId = String(item.sourceId ?? '').trim();
    if (!courseId || !sourceId) continue;
    const key = `${courseId}\0${sourceId}`;
    if (statusByKey.has(key)) continue;
    pairs.push({ courseId, sourceId, key });
  }

  for (let i = 0; i < pairs.length; i += concurrency) {
    const batch = pairs.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async ({ courseId, sourceId, key }) => {
        statusByKey.set(key, await resolveSubmissionForColumn(fetchFn, courseId, sourceId));
      }),
    );
  }

  return items.map((item) => {
    const courseId = String(item.courseId ?? '').trim();
    const sourceId = String(item.sourceId ?? '').trim();
    if (!courseId || !sourceId) return { ...item, submitted: false };
    const submitted = statusByKey.get(`${courseId}\0${sourceId}`) ?? false;
    return { ...item, submitted };
  });
}
