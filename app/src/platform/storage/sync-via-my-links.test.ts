import { describe, expect, it, beforeEach, vi } from 'vitest';
import { SK } from '../../contract/storage-keys';
import { parseSyncViaMyLinks } from './parsers';

describe('parseSyncViaMyLinks', () => {
  it('defaults to true when unset', () => {
    expect(parseSyncViaMyLinks(undefined)).toBe(true);
    expect(parseSyncViaMyLinks(null)).toBe(true);
    expect(parseSyncViaMyLinks('yes')).toBe(true);
  });

  it('only false when explicitly false', () => {
    expect(parseSyncViaMyLinks(false)).toBe(false);
    expect(parseSyncViaMyLinks(true)).toBe(true);
  });
});

describe('setPortalSyncCacheValues with sync disabled', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('writes values without dirtying meta when sync is off', async () => {
    const setMock = vi.fn(async () => undefined);
    const getMock = vi.fn(async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const key of list) {
        if (key === SK.syncViaMyLinks) out[key] = false;
      }
      return out;
    });

    vi.doMock('./chrome-storage-client', () => ({
      chromeStorageClient: {
        get: getMock,
        set: setMock,
        remove: vi.fn(async () => undefined),
        onChanged: () => () => undefined,
      },
    }));

    const { setPortalSyncCacheValues, PORTAL_SYNC_CACHE_META_KEY } = await import(
      './portal-sync-cache'
    );
    await setPortalSyncCacheValues({ [SK.theme]: 'dark' });

    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({ [SK.theme]: 'dark' });
    expect(setMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ [PORTAL_SYNC_CACHE_META_KEY]: expect.anything() }),
    );
  });
});
