/**
 * 学ポータルで `document_start` に読み込まれ、初期テーマ変数とブートカバーを差し込みます。
 */

import { PORTAL_CONTENT_SCRIPT_MATCHES } from '../../contract/origins';
import {
  isExtensionBlocked,
  startExtensionOperationalWatch,
} from '../../services/extension-runtime';
import { applyPortalEarlyBootCover } from '../../services/boot-cover';

export default defineContentScript({
  matches: [PORTAL_CONTENT_SCRIPT_MATCHES],
  runAt: 'document_start',

  main() {
    startExtensionOperationalWatch();
    if (isExtensionBlocked()) return;
    applyPortalEarlyBootCover();
  },
});
