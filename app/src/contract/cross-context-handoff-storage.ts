import { SK } from './storage-keys';

/**
 * chrome.storage.local のみ。マイリンク同期の対象外。
 * King LMS タブ ↔ ポータル間のハンドオフと、端末ローカルの LMS データ。
 */
export const LOCAL_CHROME_STORAGE_KEYS = [
  SK.kingLmsCourses,
  SK.kingLmsAssignmentDue,
  SK.kingLmsSyncPending,
  SK.kingLmsSyncReturnUrl,
  SK.kingLmsSyncAwaitCourse,
  SK.kingLmsCourseSyncToastQuiet,
  SK.kingLmsAssignmentSyncPending,
  SK.kingLmsAssignmentSyncReturnUrl,
  SK.kingLmsAssignmentSyncAwaitCalendar,
  SK.portalScrollToAssignmentOnce,
] as const;

/** ポータル設定としてマイリンクへ保存するが、King LMS タブからも読むキー */
export const CHROME_MIRROR_STORAGE_KEYS = [SK.language] as const;

export const CROSS_CONTEXT_HANDOFF_STORAGE_KEYS = [
  ...LOCAL_CHROME_STORAGE_KEYS,
  ...CHROME_MIRROR_STORAGE_KEYS,
] as const;

const HANDOFF_KEY_SET = new Set<string>(CROSS_CONTEXT_HANDOFF_STORAGE_KEYS);

export function isCrossContextHandoffStorageKey(key: string): boolean {
  return HANDOFF_KEY_SET.has(key);
}

export function isLocalLmsDataStorageKey(key: string): boolean {
  return key === SK.kingLmsCourses || key === SK.kingLmsAssignmentDue;
}

export function pickCrossContextHandoffStorage(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CROSS_CONTEXT_HANDOFF_STORAGE_KEYS) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
}
