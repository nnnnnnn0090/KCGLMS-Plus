/** King LMS コース一覧同期の開始（返却 URL を保存して遷移） */

import { canonicalPortalHref } from '../domain/portal/portal-location-url';
import { SK, KING_LMS_COURSE_SYNC_URL } from '../shared/constants';
import storage from './storage';

export interface BeginKingLmsCourseListSyncOptions {
  /** 設定パネルから開始したとき true（成功時の案内トーストを出さない） */
  toastQuiet?: boolean;
}

export async function beginKingLmsCourseListSync(
  options?: BeginKingLmsCourseListSyncOptions,
): Promise<void> {
  await storage.set({
    [SK.kingLmsSyncPending]: true,
    [SK.kingLmsSyncReturnUrl]: canonicalPortalHref(),
    [SK.kingLmsSyncAwaitCourse]: false,
    [SK.kingLmsCourseSyncToastQuiet]: Boolean(options?.toastQuiet),
  });
  window.location.href = KING_LMS_COURSE_SYNC_URL;
}
