/**
 * King LMS 上の同期処理で、一定時間応答がない場合のタイムアウトと、完了・失敗時のポータルへのリダイレクトを担います。
 */

import { canonicalPortalHref, isPortalHomePathname } from '../../domain/portal/portal-location-url';
import { SK } from '../../contract/storage-keys';
import { SYNC_HASH } from '../../contract/sync';
import { TIMING } from '../../contract/timing';
import storage from '../../lib/storage';
import { buildRedirectUrl } from './bridge-urls';
import { removeSyncOverlay } from './bridge-overlay-ui';

const SYNC_SAFETY_MS = TIMING.kingLmsSyncSafetyMs;

let assignmentSyncTimer: ReturnType<typeof setTimeout> | null = null;
let courseSyncTimer: ReturnType<typeof setTimeout> | null = null;

export function clearAssignmentTimer(): void {
  if (assignmentSyncTimer != null) {
    clearTimeout(assignmentSyncTimer);
    assignmentSyncTimer = null;
  }
}

export function clearCourseTimer(): void {
  if (courseSyncTimer != null) {
    clearTimeout(courseSyncTimer);
    courseSyncTimer = null;
  }
}

export function startAssignmentTimer(): void {
  clearAssignmentTimer();
  assignmentSyncTimer = setTimeout(async () => {
    assignmentSyncTimer = null;
    const d = await storage.get(SK.kingLmsAssignmentSyncPending);
    if (!d[SK.kingLmsAssignmentSyncPending]) return;
    removeSyncOverlay();
    await redirectAfterAssignment(SYNC_HASH.assignmentTimeout);
  }, SYNC_SAFETY_MS);
}

export function startCourseTimer(): void {
  clearCourseTimer();
  courseSyncTimer = setTimeout(async () => {
    courseSyncTimer = null;
    const d = await storage.get(SK.kingLmsSyncPending);
    if (!d[SK.kingLmsSyncPending]) return;
    removeSyncOverlay();
    await redirectAfterCourse(SYNC_HASH.courseTimeout);
  }, SYNC_SAFETY_MS);
}

export async function redirectAfterCourse(hash: string): Promise<void> {
  clearCourseTimer();
  const data = await storage.get([SK.kingLmsSyncPending, SK.kingLmsSyncReturnUrl]);
  if (!data[SK.kingLmsSyncPending]) return;
  const url = String(data[SK.kingLmsSyncReturnUrl] ?? '');
  if (!url) return;
  await storage.set({
    [SK.kingLmsSyncPending]: false,
    [SK.kingLmsSyncReturnUrl]: '',
    [SK.kingLmsSyncAwaitCourse]: false,
  });
  window.location.href = buildRedirectUrl(canonicalPortalHref(url), hash);
}

export async function redirectAfterAssignment(hash: string): Promise<void> {
  clearAssignmentTimer();
  const data = await storage.get([
    SK.kingLmsAssignmentSyncPending,
    SK.kingLmsAssignmentSyncReturnUrl,
  ]);
  if (!data[SK.kingLmsAssignmentSyncPending]) return;
  const url = String(data[SK.kingLmsAssignmentSyncReturnUrl] ?? '');
  if (!url) return;

  const toSet: Record<string, unknown> = {
    [SK.kingLmsAssignmentSyncPending]: false,
    [SK.kingLmsAssignmentSyncReturnUrl]: '',
  };
  if (hash === SYNC_HASH.assignmentDone) {
    try {
      if (isPortalHomePathname(new URL(url).pathname)) {
        toSet[SK.portalScrollToAssignmentOnce] = true;
      }
    } catch {
      /* ignore */
    }
  }
  await storage.set(toSet);
  window.location.href = buildRedirectUrl(canonicalPortalHref(url), hash);
}
