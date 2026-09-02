import { PORTAL_DOM } from '../../contract/dom';
import { CPLAN_CONTENT_SCRIPT_MATCHES } from '../../contract/origins';
import { SK } from '../../contract/storage-keys';
import { isCplanTargetPage } from '../../domain/home2/router';
import { syncCplanSurfaceRuntime } from '../../domain/themes';
import {
  isExtensionBlockedByRemoteKillSwitch,
  startExtensionOperationalWatch,
} from '../../services/extension-runtime';
import { storageRepo } from '../../platform/storage/repo';

export default defineContentScript({
  matches: [...CPLAN_CONTENT_SCRIPT_MATCHES],
  runAt: 'document_start',
  main() {
    if (!isCplanTargetPage()) return;

    startExtensionOperationalWatch();
    if (isExtensionBlockedByRemoteKillSwitch()) return;

    void (async () => {
      const enabled = await storageRepo.getCplanOverlay();
      if (!enabled || document.documentElement.dataset.cplanOverlayDisabled === 'true') return;
      syncCplanSurfaceRuntime();
      const cover = document.createElement('div');
      cover.id = PORTAL_DOM.bootCover;
      cover.className =
        'tw-fixed tw-inset-0 tw-z-boot-cover tw-pointer-events-none tw-m-0 tw-h-full tw-w-full tw-border-0 tw-p-0';
      cover.setAttribute('aria-hidden', 'true');
      (document.body ?? document.documentElement).appendChild(cover);
    })();
  },
});
