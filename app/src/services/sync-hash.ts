/**
 * King LMS からポータルへ戻った直後の `location.hash` を解釈し、トースト用メッセージを返します。
 */

import { buildPortalHistoryUrl } from '../domain/portal/portal-location-url';
import { SK, SYNC_HASH } from '../shared/constants';
import storage from '../lib/storage';
import { messagesForLanguage, normalizeLanguage, type AppLanguage } from '../i18n/messages';

export function kingLmsCourseListSyncSuccessGuideToast(language: AppLanguage): string {
  return messagesForLanguage(language).sync.courseGuideToast;
}

function hashMessages(language: AppLanguage): Record<string, string> {
  const t = messagesForLanguage(language).sync;
  return {
    [SYNC_HASH.courseDone]: t.courseGuideToast,
    [SYNC_HASH.courseTimeout]: t.courseTimeout,
    [SYNC_HASH.assignmentDone]: t.assignmentDone,
    [SYNC_HASH.assignmentTimeout]: t.assignmentTimeout,
    [SYNC_HASH.assignmentError]: t.assignmentError,
  };
}

export function consumeKingLmsSyncReturnHash(language: AppLanguage): string {
  const hash = location.hash.replace(/^#/, '');
  const msg = hashMessages(language)[hash] ?? '';

  if (msg) {
    try {
      history.replaceState(null, '', buildPortalHistoryUrl());
    } catch {
      try {
        location.hash = '';
      } catch {
        /* ignore */
      }
    }
  }
  return msg;
}

/** 起動時トースト: location.hash と storage の quiet フラグを解決する */
export async function resolveKingLmsMountToastMessage(): Promise<string> {
  const bootSnap = await storage.get([SK.kingLmsCourseSyncToastQuiet, SK.language]);
  const language = normalizeLanguage(bootSnap[SK.language]);
  let syncToastMsg = consumeKingLmsSyncReturnHash(language);
  if (bootSnap[SK.kingLmsCourseSyncToastQuiet]) {
    await storage.set({ [SK.kingLmsCourseSyncToastQuiet]: false });
    if (syncToastMsg === kingLmsCourseListSyncSuccessGuideToast(language)) {
      syncToastMsg = messagesForLanguage(language).sync.courseSaved;
    }
  }
  return syncToastMsg;
}
