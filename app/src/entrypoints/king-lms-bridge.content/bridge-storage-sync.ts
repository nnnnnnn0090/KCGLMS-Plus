/**
 * King LMS タブ（content script）で、課題・コース一覧の同期結果を拡張機能ストレージへ書き込みます。
 * `king-lms-hooks`（MAIN ワールド）からの `postMessage` は `bridge-message-listener` が受け取り、本モジュールが保存とポータルへのリダイレクトを担います。
 */

import { SK, SYNC_HASH } from '../../shared/constants';
import storage from '../../lib/storage';
import { isCoursePage, isLoginRedirectPage, isAssignmentSyncPage } from './bridge-urls';
import { mountLoginHint, mountSyncOverlay, removeSyncOverlay } from './bridge-overlay-ui';
import { messagesForLanguage, normalizeLanguage } from '../../i18n/messages';
import {
  clearAssignmentTimer,
  clearCourseTimer,
  redirectAfterAssignment,
  redirectAfterCourse,
  startAssignmentTimer,
  startCourseTimer,
} from './bridge-redirect-flow';

export async function maybeShowOverlayFromStorage(): Promise<void> {
  const data = await storage.get([
    SK.kingLmsSyncPending,
    SK.kingLmsAssignmentSyncPending,
    SK.kingLmsAssignmentSyncAwaitCalendar,
    SK.kingLmsAssignmentSyncReturnUrl,
    SK.language,
  ]);
  const language = normalizeLanguage(data[SK.language]);
  const text = messagesForLanguage(language).sync;
  const assignmentWaiting =
    !!data[SK.kingLmsAssignmentSyncPending] ||
    (!!data[SK.kingLmsAssignmentSyncAwaitCalendar] &&
      !!data[SK.kingLmsAssignmentSyncReturnUrl] &&
      isAssignmentSyncPage());
  if (assignmentWaiting) {
    mountSyncOverlay(language, text.assignmentFetching);
    startAssignmentTimer();
  } else if (data[SK.kingLmsSyncPending]) {
    mountSyncOverlay(language);
    startCourseTimer();
  }
}

export async function cancelPendingForLoginRedirect(): Promise<void> {
  clearAssignmentTimer();
  clearCourseTimer();
  removeSyncOverlay();
  const data = await storage.get([
    SK.kingLmsSyncReturnUrl,
    SK.kingLmsAssignmentSyncReturnUrl,
    SK.language,
  ]);
  const language = normalizeLanguage(data[SK.language]);
  const hadCourseReturn =
    typeof data[SK.kingLmsSyncReturnUrl] === 'string' && !!data[SK.kingLmsSyncReturnUrl];
  const hadAssignmentReturn =
    typeof data[SK.kingLmsAssignmentSyncReturnUrl] === 'string' &&
    !!data[SK.kingLmsAssignmentSyncReturnUrl];
  await storage.set({
    [SK.kingLmsSyncPending]: false,
    [SK.kingLmsSyncAwaitCourse]: hadCourseReturn,
    [SK.kingLmsAssignmentSyncPending]: false,
    [SK.kingLmsAssignmentSyncAwaitCalendar]: hadAssignmentReturn,
  });
  if (hadCourseReturn || hadAssignmentReturn) {
    mountLoginHint(hadAssignmentReturn && !hadCourseReturn, language);
  }
}

export async function saveCourses(courses: unknown[]): Promise<void> {
  if (isLoginRedirectPage()) {
    await cancelPendingForLoginRedirect();
    return;
  }
  const data = await storage.get([
    SK.kingLmsSyncPending,
    SK.kingLmsSyncAwaitCourse,
    SK.kingLmsSyncReturnUrl,
    SK.language,
  ]);
  const language = normalizeLanguage(data[SK.language]);
  let syncPending = !!data[SK.kingLmsSyncPending];
  const hadAwait = !!data[SK.kingLmsSyncAwaitCourse];
  // AwaitCourse フラグ（ログイン後に戻ったケース）でも同期を継続する
  if (!syncPending && hadAwait && data[SK.kingLmsSyncReturnUrl] && isCoursePage())
    syncPending = true;
  if (syncPending) mountSyncOverlay(language);
  const toSet: Record<string, unknown> = { [SK.kingLmsCourses]: courses };
  if (hadAwait && isCoursePage()) {
    toSet[SK.kingLmsSyncAwaitCourse] = false;
    if (data[SK.kingLmsSyncReturnUrl]) {
      toSet[SK.kingLmsSyncPending] = true;
      syncPending = true;
    }
  } else if (syncPending && hadAwait) {
    toSet[SK.kingLmsSyncAwaitCourse] = false;
    toSet[SK.kingLmsSyncPending] = true;
  }
  await storage.set(toSet);
  if (syncPending) await redirectAfterCourse(SYNC_HASH.courseDone);
}

export type SaveAssignmentDueOpts = {
  /** 行はあるが締切行が 0 件: 既存の kingLmsAssignmentDue を壊さず、同期リダイレクトだけ行う */
  assignmentSyncNoOp?: boolean;
};

/**
 * ログイン直後の「カレンダーページ待ち」→ 課題同期の通常ペンディングへ寄せる。
 * saveAssignmentDue 成功・空スキップ・失敗の各経路で同じ形を使う。
 */
function patchAssignmentAwaitCalendarToPending(): Record<string, unknown> {
  return {
    [SK.kingLmsAssignmentSyncAwaitCalendar]: false,
    [SK.kingLmsAssignmentSyncPending]: true,
  };
}

/**
 * kingLmsAssignmentDue を更新せず、ストレージ上の課題一覧を保ったまま同期フローだけ完了する
 *（noOp / 空上書きスキップ時のリダイレクト用）
 */
async function completeAssignmentSyncKeepStoredDue(
  syncPending: boolean,
  hadAwait: boolean,
): Promise<void> {
  if (syncPending && hadAwait) {
    await storage.set(patchAssignmentAwaitCalendarToPending());
  }
  if (syncPending) await redirectAfterAssignment(SYNC_HASH.assignmentDone);
}

export async function saveAssignmentDue(
  items: unknown[],
  capturedAt: number,
  captureState?: string,
  opts?: SaveAssignmentDueOpts,
): Promise<void> {
  const data = await storage.get([
    SK.kingLmsAssignmentSyncPending,
    SK.kingLmsAssignmentSyncAwaitCalendar,
    SK.kingLmsAssignmentSyncReturnUrl,
    SK.language,
  ]);
  const language = normalizeLanguage(data[SK.language]);
  let syncPending = !!data[SK.kingLmsAssignmentSyncPending];
  const hadAwait = !!data[SK.kingLmsAssignmentSyncAwaitCalendar];
  if (!syncPending && hadAwait && data[SK.kingLmsAssignmentSyncReturnUrl] && isAssignmentSyncPage())
    syncPending = true;
  if (syncPending)
    mountSyncOverlay(language, messagesForLanguage(language).sync.assignmentFetching);

  if (captureState === 'error') {
    if (syncPending) {
      if (hadAwait) await storage.set(patchAssignmentAwaitCalendarToPending());
      await redirectAfterAssignment(SYNC_HASH.assignmentError);
    }
    return;
  }

  if (opts?.assignmentSyncNoOp) {
    await completeAssignmentSyncKeepStoredDue(syncPending, hadAwait);
    return;
  }

  // 空配列で既存有りを潰さない（hooks 以外のレースの保険）
  if (items.length === 0) {
    const existing = (await storage.get(SK.kingLmsAssignmentDue)) as
      | { items?: unknown[] }
      | undefined;
    const prevItems = existing?.items;
    if (Array.isArray(prevItems) && prevItems.length > 0) {
      await completeAssignmentSyncKeepStoredDue(syncPending, hadAwait);
      return;
    }
  }

  const toSet: Record<string, unknown> = { [SK.kingLmsAssignmentDue]: { items, capturedAt } };
  if (syncPending && hadAwait) {
    Object.assign(toSet, patchAssignmentAwaitCalendarToPending());
  }
  await storage.set(toSet);
  if (syncPending) await redirectAfterAssignment(SYNC_HASH.assignmentDone);
}
