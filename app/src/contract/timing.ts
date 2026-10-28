/** タイミング契約（§4.4.5）。 */

export const TIMING = {
  bootCoverRafDefault: 3,
  bootCoverRafWithToast: 5,
  toastDefaultMs: 3200,
  toastSyncLongMs: 5800,
  toastUpdateMs: 5200,
  toastCloseFallbackMs: 420,
  calendarHoverHideMs: 60,
  calendarWatchdogMs: 15000,
  kingLmsSyncSafetyMs: 120000,
  kingLmsCalendarFlushDebounceMs: 700,
  pageFetchPollMs: 200,
  pageFetchDeadlineMs: 15000,
  pageFetchMaxAttempts: 10,
  pageFetchRetryBaseMs: 100,
  pageFetchRetryStepMs: 200,
  pageFetchRetryMaxMs: 2200,
  newsSenderPollMs: 100,
  newsSenderPollMaxAttempts: 50,
  cplanSnapshotPollMs: 100,
  cplanSnapshotMaxAttempts: 20,
  assignmentCapturedLabelMs: 1000,
  gradebookFetchRetryCount: 3,
  gradebookFetchRetryDelayMs: 400,
  gradebookConcurrency: 8,
} as const;

/** pageFetch 401 リトライ遅延: `min(100+attempt*200, 2200)` */
export function pageFetchRetryDelayMs(attempt: number): number {
  return Math.min(
    TIMING.pageFetchRetryBaseMs + attempt * TIMING.pageFetchRetryStepMs,
    TIMING.pageFetchRetryMaxMs,
  );
}

/** 1回の通信にかかりうる時間の目安 */
const PORTAL_API_REQUEST_ALLOWANCE_MS = 20000;

/**
 * portalApiRequest が応答を待つ上限。
 * ページ側のブリッジは「認証ヘッダーが揃うまでの待機」と「401 の再試行」を行うので、
 * それより先に呼び出し側が諦めないよう、両方の最大時間に通信時間を足した値にする。
 */
export const PORTAL_API_RESPONSE_DEADLINE_MS =
  TIMING.pageFetchDeadlineMs +
  Array.from({ length: TIMING.pageFetchMaxAttempts }, (_, attempt) =>
    pageFetchRetryDelayMs(attempt),
  ).reduce((sum, delay) => sum + delay, 0) +
  PORTAL_API_REQUEST_ALLOWANCE_MS;
