import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SK } from '../contract/storage-keys';
import { installChromeStorageMock } from '../platform/storage/chrome-storage-client.test-support';
import type { PortalUserLink } from './user-html-link';

const portalLinksApi = vi.hoisted(() => ({
  fetch: vi.fn<() => Promise<PortalUserLink[]>>(),
  save: vi.fn<(links: readonly PortalUserLink[]) => Promise<void>>(),
}));

vi.mock('./user-html-link', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./user-html-link')>();
  return {
    ...actual,
    fetchPortalUserLinks: portalLinksApi.fetch,
    savePortalUserLinks: portalLinksApi.save,
  };
});

import {
  isPortalSettingsMarkerLink,
  savePortalExtensionSnapshot,
  setPortalMyLinksSyncEnabled,
} from './portal-settings-sync';

describe('portal settings sync concurrency', () => {
  beforeEach(() => {
    installChromeStorageMock({ [SK.syncViaMyLinks]: true });
    vi.stubGlobal('location', { hostname: 'home.kcg.ac.jp' });
    portalLinksApi.fetch.mockReset();
    portalLinksApi.save.mockReset();
  });

  it('does not restore markers when sync is disabled during an upload', async () => {
    let remoteLinks: PortalUserLink[] = [];
    let releaseFirstSave: () => void = () => undefined;
    let notifyFirstSave: () => void = () => undefined;
    const firstSaveStarted = new Promise<void>((resolve) => {
      notifyFirstSave = resolve;
    });
    const firstSaveMayFinish = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });

    portalLinksApi.fetch.mockImplementation(async () => structuredClone(remoteLinks));
    portalLinksApi.save.mockImplementationOnce(async (links) => {
      notifyFirstSave();
      await firstSaveMayFinish;
      remoteLinks = structuredClone([...links]);
    });
    portalLinksApi.save.mockImplementation(async (links) => {
      remoteLinks = structuredClone([...links]);
    });

    const upload = savePortalExtensionSnapshot({
      updatedAt: 1_700_000_000_000,
      storage: { [SK.theme]: 'dark' },
    });
    await firstSaveStarted;

    const disable = setPortalMyLinksSyncEnabled(false);
    releaseFirstSave();
    await Promise.all([upload, disable]);

    expect(portalLinksApi.save).toHaveBeenCalledTimes(2);
    expect(
      remoteLinks.filter((link) => isPortalSettingsMarkerLink(link)).every((link) => link.delFlg),
    ).toBe(true);
  });
});
