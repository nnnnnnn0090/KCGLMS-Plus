/**
 * マイリンク同期対象設定の `chrome.storage.local` 永続キャッシュ。
 *
 * 設定値は既存の個別キーを維持し、同期状態だけを内部メタデータで管理する。
 */

import {
  pickPortalSyncedStorage,
  PORTAL_SYNCED_STORAGE_KEYS,
} from '../../contract/portal-synced-storage';
import { SK } from '../../contract/storage-keys';
import { chromeStorageClient } from './chrome-storage-client';
import { parseSyncViaMyLinks } from './parsers';

/** マイリンク同期対象キーの端末内キャッシュ状態（マイリンクへは保存しない） */
export const PORTAL_SYNC_CACHE_META_KEY = 'portalThemePortalSyncCacheMeta' as const;

export interface PortalSyncCacheMeta {
  version: 1;
  updatedAt: number;
  dirty: boolean;
  ownerId: string | null;
}

export interface PortalSyncCacheSnapshot {
  meta: PortalSyncCacheMeta;
  storage: Record<string, unknown>;
}

export type PortalSyncBootstrapDecision = 'upload-local' | 'use-portal' | 'initialize-local';

const EMPTY_META: PortalSyncCacheMeta = {
  version: 1,
  updatedAt: 0,
  dirty: false,
  ownerId: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parsePortalSyncCacheMeta(value: unknown): PortalSyncCacheMeta {
  if (!isRecord(value) || value.version !== 1) return { ...EMPTY_META };
  const updatedAt =
    typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
      ? Math.max(0, value.updatedAt)
      : 0;
  const ownerId =
    typeof value.ownerId === 'string' && value.ownerId.trim() ? value.ownerId.trim() : null;
  return {
    version: 1,
    updatedAt,
    dirty: value.dirty === true,
    ownerId,
  };
}

export function decidePortalSyncBootstrap(
  portal: { updatedAt: number } | null,
  portalOwnerId: string | null,
  cache: PortalSyncCacheSnapshot,
): PortalSyncBootstrapDecision {
  if (portal) {
    const sameOwner = portalOwnerId !== null && cache.meta.ownerId === portalOwnerId;
    return sameOwner && cache.meta.dirty && cache.meta.updatedAt > portal.updatedAt
      ? 'upload-local'
      : 'use-portal';
  }
  return 'initialize-local';
}

export async function readPortalSyncCache(): Promise<PortalSyncCacheSnapshot> {
  const raw = await chromeStorageClient.get([
    ...PORTAL_SYNCED_STORAGE_KEYS,
    PORTAL_SYNC_CACHE_META_KEY,
  ]);
  return {
    meta: parsePortalSyncCacheMeta(raw[PORTAL_SYNC_CACHE_META_KEY]),
    storage: pickPortalSyncedStorage(raw),
  };
}

function nextUpdatedAt(previous: number): number {
  return Math.max(Date.now(), previous + 1);
}

async function clearDirtyIfSyncWasDisabled(): Promise<void> {
  const flag = await chromeStorageClient.get(SK.syncViaMyLinks);
  if (parseSyncViaMyLinks(flag[SK.syncViaMyLinks])) return;
  const current = await readPortalSyncCache();
  if (!current.meta.dirty) return;
  const confirmation = await chromeStorageClient.get(SK.syncViaMyLinks);
  if (parseSyncViaMyLinks(confirmation[SK.syncViaMyLinks])) return;
  await chromeStorageClient.set({
    [PORTAL_SYNC_CACHE_META_KEY]: {
      ...current.meta,
      dirty: false,
    } satisfies PortalSyncCacheMeta,
  });
}

/** ユーザー操作による設定変更を保存し、マイリンク未同期として印を付ける。 */
export async function setPortalSyncCacheValues(values: Record<string, unknown>): Promise<void> {
  const synced = pickPortalSyncedStorage(values);
  if (Object.keys(synced).length === 0) return;

  const flagSnap = await chromeStorageClient.get(SK.syncViaMyLinks);
  if (!parseSyncViaMyLinks(flagSnap[SK.syncViaMyLinks])) {
    // 同期オフ時はローカルへ書くだけ（dirty にしない）
    await chromeStorageClient.set(synced);
    return;
  }

  const current = await readPortalSyncCache();
  const meta: PortalSyncCacheMeta = {
    ...current.meta,
    version: 1,
    updatedAt: nextUpdatedAt(current.meta.updatedAt),
    dirty: true,
  };
  await chromeStorageClient.set({
    ...synced,
    [PORTAL_SYNC_CACHE_META_KEY]: meta,
  });
  await clearDirtyIfSyncWasDisabled();
}

/** 同期対象設定を削除し、削除操作自体を未同期変更として記録する。 */
export async function removePortalSyncCacheValues(keys: readonly string[]): Promise<void> {
  const syncedKeys = keys.filter((key) =>
    (PORTAL_SYNCED_STORAGE_KEYS as readonly string[]).includes(key),
  );
  if (syncedKeys.length === 0) return;

  const flagSnap = await chromeStorageClient.get(SK.syncViaMyLinks);
  if (!parseSyncViaMyLinks(flagSnap[SK.syncViaMyLinks])) {
    await chromeStorageClient.remove(syncedKeys);
    return;
  }

  const current = await readPortalSyncCache();
  const meta: PortalSyncCacheMeta = {
    ...current.meta,
    version: 1,
    updatedAt: nextUpdatedAt(current.meta.updatedAt),
    dirty: true,
  };
  await chromeStorageClient.remove(syncedKeys);
  await chromeStorageClient.set({ [PORTAL_SYNC_CACHE_META_KEY]: meta });
  await clearDirtyIfSyncWasDisabled();
}

/** マイリンクからの復元など、同期済みスナップショットでキャッシュ全体を置換する。 */
export async function replacePortalSyncCache(
  snapshot: { updatedAt: number; storage: Record<string, unknown> },
  ownerId: string | null,
  dirty = false,
): Promise<void> {
  const storage = pickPortalSyncedStorage(snapshot.storage);
  const meta: PortalSyncCacheMeta = {
    version: 1,
    updatedAt: Math.max(0, snapshot.updatedAt),
    dirty,
    ownerId,
  };
  await chromeStorageClient.remove([...PORTAL_SYNCED_STORAGE_KEYS]);
  await chromeStorageClient.set({
    ...storage,
    [PORTAL_SYNC_CACHE_META_KEY]: meta,
  });
}

/** 保存開始後に追加変更がなかった場合だけ、キャッシュを同期済みにする。 */
export async function markPortalSyncCacheClean(
  expectedUpdatedAt: number,
  ownerId: string | null,
): Promise<boolean> {
  const current = await readPortalSyncCache();
  if (current.meta.updatedAt !== expectedUpdatedAt) return false;
  await chromeStorageClient.set({
    [PORTAL_SYNC_CACHE_META_KEY]: {
      ...current.meta,
      version: 1,
      dirty: false,
      ownerId,
    } satisfies PortalSyncCacheMeta,
  });
  return true;
}
