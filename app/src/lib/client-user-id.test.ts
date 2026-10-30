import { beforeEach, describe, expect, it } from 'vitest';
import { SK } from '../contract/storage-keys';
import { installChromeStorageMock } from '../platform/storage/chrome-storage-client.test-support';
import {
  PORTAL_SYNC_DEVICE_KEY,
  PORTAL_SYNC_LEDGER_KEY,
  resetPortalSyncLedgerForTests,
} from '../platform/storage/portal-sync-ledger';
import { getOrCreateClientUserId, readClientUserIdForTelemetry } from './client-user-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('anonymous user ID for telemetry', () => {
  let stored: Record<string, unknown>;

  beforeEach(() => {
    resetPortalSyncLedgerForTests();
    stored = {
      [PORTAL_SYNC_DEVICE_KEY]: 'dev1',
      [PORTAL_SYNC_LEDGER_KEY]: { version: 1, space: null, adoptRemote: false, syncedClock: 0 },
    };
    installChromeStorageMock(stored);
  });

  it('is not created before the first-run tutorial (the sync choice) is finished', async () => {
    expect(await readClientUserIdForTelemetry()).toBeNull();
    expect(stored[SK.clientUserId]).toBeUndefined();
  });

  it('uses an ID that arrived by sync instead of creating a new one', async () => {
    stored[SK.clientUserId] = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(await readClientUserIdForTelemetry()).toBe('0f8fad5b-d9cb-469f-a165-70867728950e');
  });

  it('creates one after the tutorial and keeps using it', async () => {
    stored[SK.portalGuidedTourDone] = true;
    const id = await readClientUserIdForTelemetry();
    expect(id).toMatch(UUID);
    expect(await readClientUserIdForTelemetry()).toBe(id);
  });

  it('can still be created on demand (community access needs one)', async () => {
    expect(await getOrCreateClientUserId()).toMatch(UUID);
  });
});
