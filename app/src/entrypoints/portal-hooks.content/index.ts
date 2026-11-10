/**
 * 学ポータル上で `document_start`・MAIN ワールドとして読み込まれます。
 * ページ本体と同じ `fetch` / XHR をラップし、対象 API の JSON をオーバーレイ側へ `postMessage` するとともに、`pageFetch` ブリッジで認証付き再取得を行います。
 */

import { PORTAL_CONTENT_SCRIPT_MATCHES } from '../../contract/origins';
import {
  isExtensionBlocked,
  startExtensionOperationalWatch,
} from '../../services/extension-runtime';
import { installFetchHook } from './portal-fetch-hook';
import { installLogoffBridge } from './portal-logoff-bridge';
import { installFetchBridge } from './portal-page-fetch-bridge';
import { installXhrHook } from './portal-xhr-hook';

export default defineContentScript({
  matches: [PORTAL_CONTENT_SCRIPT_MATCHES],
  runAt: 'document_start',
  world: 'MAIN',

  main() {
    startExtensionOperationalWatch();
    if (isExtensionBlocked()) return;
    installFetchHook();
    installXhrHook();
    installFetchBridge();
    installLogoffBridge();
  },
});
