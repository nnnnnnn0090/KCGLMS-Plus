import { createElement } from 'react';
import '../../styles/tailwind-overlay.css';
import { CplanApp } from '../../ui/components/cplan/CplanApp';
import { CPLAN_CONTENT_SCRIPT_MATCHES } from '../../contract/origins';
import { TIMING } from '../../contract/timing';
import { readCplanSnapshot } from '../../domain/cplan/snapshot';
import {
  appendPortalOverlayShell,
  removePortalBackdrop,
  syncCplanSurfaceRuntime,
} from '../../domain/themes';
import {
  isExtensionBlockedByRemoteKillSwitch,
  startExtensionOperationalWatch,
} from '../../services/extension-runtime';
import { storageRepo } from '../../platform/storage/repo';

async function waitForCplanSnapshot() {
  for (let attempt = 0; attempt < TIMING.cplanSnapshotMaxAttempts; attempt += 1) {
    const snapshot = readCplanSnapshot();
    if (snapshot) return snapshot;
    await new Promise((resolve) => window.setTimeout(resolve, TIMING.cplanSnapshotPollMs));
  }
  return readCplanSnapshot();
}

export default defineContentScript({
  matches: [...CPLAN_CONTENT_SCRIPT_MATCHES],
  runAt: 'document_end',
  main() {
    void (async () => {
      try {
        startExtensionOperationalWatch();
        if (isExtensionBlockedByRemoteKillSwitch()) {
          removePortalBackdrop();
          return;
        }
        const enabled = await storageRepo.getCplanOverlay();
        if (!enabled) {
          document.documentElement.dataset.cplanOverlayDisabled = 'true';
          removePortalBackdrop();
          return;
        }
        const snapshot = await waitForCplanSnapshot();
        if (!snapshot) {
          removePortalBackdrop();
          return;
        }

        const { overlay, scroller } = appendPortalOverlayShell();
        overlay.classList.add('p-surface-cplan');
        syncCplanSurfaceRuntime();

        const { createRoot } = await import('react-dom/client');
        createRoot(scroller).render(createElement(CplanApp, { snapshot }));
      } catch {
        removePortalBackdrop();
      }
    })();
  },
});
