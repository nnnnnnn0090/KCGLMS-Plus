/**
 * 同一タブ内の `king-lms-hooks`（MAIN）が `window.postMessage` で送ったデータを受け取り、`bridge-storage-sync` へ渡します。
 */

import { KING_LMS_HOOK } from '../../contract/messages';
import { listenMainMessages } from '../../platform/messaging/main-bus';
import {
  cancelPendingForLoginRedirect,
  saveAssignmentDue,
  saveCourses,
} from './bridge-storage-sync';

/** `message` リスナーを登録し、hooks からの通知をストレージ更新とリダイレクトへ集約します。 */
export function installMessageListener(): void {
  listenMainMessages(
    (msg) => {
      if (msg.type === KING_LMS_HOOK.syncAbortType) {
        void cancelPendingForLoginRedirect();
        return;
      }

      if (msg.type === KING_LMS_HOOK.assignmentDuePostType) {
        if (msg.captureState === 'error') {
          void saveAssignmentDue([], Date.now(), 'error');
          return;
        }
        const capturedAt = typeof msg.capturedAt === 'number' ? msg.capturedAt : Date.now();
        void saveAssignmentDue(msg.items, capturedAt, undefined, {
          assignmentSyncNoOp: msg.assignmentSyncNoOp === true,
        });
        return;
      }

      if (msg.type === KING_LMS_HOOK.coursesPostType) {
        void saveCourses(msg.courses);
      }
    },
    { requireKingLmsOrigin: true },
  );
}
