/**
 * Home2 Web メールの対象 URL で React オーバーレイをマウントします。
 */

import { HOME2_MAIL_CONTENT_SCRIPT_MATCHES } from '../../contract/origins';
import {
  isExtensionBlockedByRemoteKillSwitch,
  startExtensionOperationalWatch,
} from '../../services/extension-runtime';
import { resolveHome2MailRoute, teardownHome2Overlay } from '../../services/home2-host';
import { mountHome2MailOverlay } from './mount-home2-mail-overlay';

export default defineContentScript({
  matches: [...HOME2_MAIL_CONTENT_SCRIPT_MATCHES],
  runAt: 'document_end',

  main() {
    startExtensionOperationalWatch();
    if (isExtensionBlockedByRemoteKillSwitch()) {
      teardownHome2Overlay();
      return;
    }

    const route = resolveHome2MailRoute();
    if (!route) {
      teardownHome2Overlay();
      return;
    }

    void mountHome2MailOverlay(route);
  },
});
