/**
 * King LMS オリジンで `document_start` に読み込まれる content script です。
 * `king-lms-hooks` が同一ページの MAIN ワールドでフックした結果を `postMessage` 経由で受け、ストレージとリダイレクトを扱います。
 */

import { KING_LMS_ORIGIN } from '../../contract/origins';
import {
  isExtensionBlocked,
  startExtensionOperationalWatch,
} from '../../services/extension-runtime';
import { isLoginRedirectPage, isSamlLoginPage } from './bridge-urls';
import { cancelPendingForLoginRedirect, maybeShowOverlayFromStorage } from './bridge-storage-sync';
import { installMessageListener } from './bridge-message-listener';

export default defineContentScript({
  matches: [`${KING_LMS_ORIGIN}/*`],
  runAt: 'document_start',

  main() {
    startExtensionOperationalWatch();
    if (isExtensionBlocked()) return;
    scheduleInit();
    installMessageListener();
  },
});

function scheduleInit(): void {
  function run(): void {
    if (isSamlLoginPage()) return;
    if (isLoginRedirectPage()) {
      void cancelPendingForLoginRedirect();
      return;
    }
    void maybeShowOverlayFromStorage();
  }
  if (document.body) run();
  else document.addEventListener('DOMContentLoaded', run, { once: true });
}
