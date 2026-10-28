import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SK } from '../../contract/storage-keys';
import { portalSyncItemEntryId } from '../../domain/portal-sync-doc';
import { installChromeStorageMock } from './chrome-storage-client.test-support';
import {
  backupLocalPortalSyncState,
  hasPendingPortalSyncChanges,
  listPortalSyncBackups,
  restorePortalSyncBackup,
  LEGACY_PORTAL_SYNC_CACHE_META_KEY,
  PORTAL_SYNC_DEVICE_KEY,
  PORTAL_SYNC_LEDGER_KEY,
  portalSyncStampKey,
  readLocalPortalSyncState,
  removePortalSyncedValues,
  resetPortalSyncLedgerForTests,
  updatePortalSyncLedgerMeta,
  writePortalSyncedValues,
} from './portal-sync-ledger';

const LEDGER = { version: 1, space: null, adoptRemote: false, syncedClock: 0 };

describe('portal sync ledger', () => {
  let stored: Record<string, unknown>;

  beforeEach(() => {
    resetPortalSyncLedgerForTests();
    stored = { [PORTAL_SYNC_DEVICE_KEY]: 'dev1', [PORTAL_SYNC_LEDGER_KEY]: LEDGER };
    installChromeStorageMock(stored);
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores the value and its stamp together', async () => {
    await writePortalSyncedValues({ [SK.theme]: 'ocean' });
    expect(stored[SK.theme]).toBe('ocean');
    expect(stored[portalSyncStampKey(SK.theme)]).toEqual([1_800_000_000_000, 'dev1']);
    expect(await hasPendingPortalSyncChanges()).toBe(true);
  });

  it('does not restamp a value that did not change', async () => {
    await writePortalSyncedValues({ [SK.theme]: 'ocean' });
    vi.setSystemTime(1_800_000_100_000);
    await writePortalSyncedValues({ [SK.theme]: 'ocean' });
    expect(stored[portalSyncStampKey(SK.theme)]).toEqual([1_800_000_000_000, 'dev1']);
  });

  it('always stamps after the last change it has seen, even with a slow clock', async () => {
    stored[portalSyncStampKey(SK.theme)] = [1_900_000_000_000, 'other'];
    await updatePortalSyncLedgerMeta({ syncedClock: 1_950_000_000_000 });
    await writePortalSyncedValues({ [SK.theme]: 'ocean' });
    expect(stored[portalSyncStampKey(SK.theme)]).toEqual([1_950_000_000_001, 'dev1']);
    expect(await hasPendingPortalSyncChanges()).toBe(true);
  });

  it('records removed events as tombstones', async () => {
    const at = new Date().toISOString();
    const ev = (id: string) => ({ id, title: id, kind: 'once', date: '2026-11-01', createdAt: at });
    await writePortalSyncedValues({
      [SK.customCalEvents]: { schemaVersion: 1, events: [ev('event-a'), ev('event-b')] },
    });
    await writePortalSyncedValues({
      [SK.customCalEvents]: { schemaVersion: 1, events: [ev('event-b')] },
    });
    const { doc } = await readLocalPortalSyncState();
    expect(doc[portalSyncItemEntryId(SK.customCalEvents, 'event-a')]).toMatchObject({ del: true });
    expect(doc[portalSyncItemEntryId(SK.customCalEvents, 'event-b')]).toMatchObject({
      v: ev('event-b'),
    });
  });

  it('records removed settings as deletions', async () => {
    await writePortalSyncedValues({ [SK.theme]: 'ocean' });
    await removePortalSyncedValues([SK.theme]);
    expect(stored[SK.theme]).toBeUndefined();
    const { doc } = await readLocalPortalSyncState();
    expect(doc[SK.theme]).toMatchObject({ del: true });
  });

  it('writes generated defaults with a stamp that loses to any real change', async () => {
    await writePortalSyncedValues({ [SK.clientUserId]: 'generated' }, { weak: true });
    const { doc } = await readLocalPortalSyncState();
    expect(doc[SK.clientUserId]?.s.t).toBe(0);
    expect(await hasPendingPortalSyncChanges()).toBe(false);
  });
});

describe('portal sync backups', () => {
  let stored: Record<string, unknown>;

  beforeEach(() => {
    resetPortalSyncLedgerForTests();
    stored = { [PORTAL_SYNC_DEVICE_KEY]: 'dev1', [PORTAL_SYNC_LEDGER_KEY]: LEDGER };
    installChromeStorageMock(stored);
  });

  it('restores a backup as a normal change that wins and syncs everywhere', async () => {
    await writePortalSyncedValues({ [SK.theme]: 'ocean', [SK.clientUserId]: 'me' });
    await backupLocalPortalSyncState('sync');
    await writePortalSyncedValues({ [SK.theme]: 'forest', [SK.language]: 'en' });

    const [backup] = await listPortalSyncBackups();
    expect(backup.values).toEqual({ [SK.theme]: 'ocean' });
    expect(await restorePortalSyncBackup(backup.id)).toBe(true);

    expect(stored[SK.theme]).toBe('ocean');
    expect(stored[SK.language]).toBeUndefined();
    expect(stored[SK.clientUserId]).toBe('me');
    expect(await hasPendingPortalSyncChanges()).toBe(true);
    // 戻す前の状態もバックアップに残る。
    const backups = await listPortalSyncBackups();
    expect(backups[0]).toMatchObject({ reason: 'restore', values: { [SK.theme]: 'forest' } });
  });

  it('skips duplicate backups and keeps only the latest ones', async () => {
    await writePortalSyncedValues({ [SK.theme]: 'ocean' });
    await backupLocalPortalSyncState('sync');
    await backupLocalPortalSyncState('sync');
    expect(await listPortalSyncBackups()).toHaveLength(1);
    for (let i = 0; i < 15; i += 1) {
      await writePortalSyncedValues({ [SK.theme]: `theme-${i}` });
      await backupLocalPortalSyncState('sync');
    }
    const backups = await listPortalSyncBackups();
    expect(backups).toHaveLength(10);
    expect(backups[0].values[SK.theme]).toBe('theme-14');
  });
});

describe('portal sync ledger migration from the old cache', () => {
  let stored: Record<string, unknown>;

  beforeEach(() => {
    resetPortalSyncLedgerForTests();
  });

  function install(extra: Record<string, unknown>) {
    stored = { [PORTAL_SYNC_DEVICE_KEY]: 'dev1', [SK.theme]: 'ocean', ...extra };
    installChromeStorageMock(stored);
  }

  it('treats unsent changes as changes made at their original time', async () => {
    install({
      [LEGACY_PORTAL_SYNC_CACHE_META_KEY]: {
        version: 1,
        updatedAt: 1234,
        dirty: true,
        ownerId: null,
      },
    });
    const { doc, meta } = await readLocalPortalSyncState();
    expect(doc[SK.theme]).toEqual({ s: { t: 1234, d: 'dev1' }, v: 'ocean' });
    expect(meta.adoptRemote).toBe(false);
    expect(stored[LEGACY_PORTAL_SYNC_CACHE_META_KEY]).toBeUndefined();
  });

  it('adopts the portal data next time when the old cache was already synced', async () => {
    install({
      [LEGACY_PORTAL_SYNC_CACHE_META_KEY]: {
        version: 1,
        updatedAt: 1234,
        dirty: false,
        ownerId: null,
      },
    });
    const { doc, meta } = await readLocalPortalSyncState();
    expect(doc[SK.theme]?.s.t).toBe(0);
    expect(meta.adoptRemote).toBe(true);
  });

  it('keeps sync on, and the old dark theme, for people who were already syncing', async () => {
    resetPortalSyncLedgerForTests();
    stored = {
      [PORTAL_SYNC_DEVICE_KEY]: 'dev1',
      [LEGACY_PORTAL_SYNC_CACHE_META_KEY]: {
        version: 1,
        updatedAt: 1,
        dirty: false,
        ownerId: null,
      },
    };
    installChromeStorageMock(stored);
    await readLocalPortalSyncState();
    expect(stored[SK.syncViaMyLinks]).toBe(true);
    expect(stored[SK.theme]).toBe('dark');
    expect(stored[SK.font]).toBe('default');
    // 他の端末で選んだテーマがあれば、そちらが勝つ（スタンプなし）。
    expect(stored[portalSyncStampKey(SK.theme)]).toBeUndefined();
  });

  it('leaves sync off and the theme unset on a fresh install', async () => {
    resetPortalSyncLedgerForTests();
    stored = { [PORTAL_SYNC_DEVICE_KEY]: 'dev1' };
    installChromeStorageMock(stored);
    await readLocalPortalSyncState();
    expect(stored[SK.syncViaMyLinks]).toBeUndefined();
    expect(stored[SK.theme]).toBeUndefined();
    expect(stored[SK.font]).toBeUndefined();
  });

  it('does not let a device that had sync off overwrite others with old values', async () => {
    install({ [SK.syncViaMyLinks]: false });
    const { doc, meta } = await readLocalPortalSyncState();
    // いつ変えた値か分からないので、同期をオンにしたとき確認の対象になる。
    expect(doc[SK.theme]).toEqual({ s: { t: 0, d: '' }, v: 'ocean' });
    expect(meta.adoptRemote).toBe(false);
  });
});
