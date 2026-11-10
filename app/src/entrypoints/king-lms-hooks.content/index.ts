/**
 * King LMS オリジンで `document_start`・MAIN ワールドとして読み込まれます。
 * `fetch` / XHR をフックし、コース一覧や calendarItems の結果を同一タブの `king-lms-bridge` へ `postMessage` します。
 */

import { KING_LMS_ORIGIN } from '../../contract/origins';
import {
  isExtensionBlocked,
  startExtensionOperationalWatch,
} from '../../services/extension-runtime';
import { installKingLmsHook } from '../../services/king-lms-hooks';

export default defineContentScript({
  matches: [`${KING_LMS_ORIGIN}/*`],
  runAt: 'document_start',
  world: 'MAIN',

  main() {
    startExtensionOperationalWatch();
    if (isExtensionBlocked()) return;
    installKingLmsHook();
  },
});
