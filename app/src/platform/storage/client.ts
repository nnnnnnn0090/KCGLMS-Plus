/**
 * 拡張 storage クライアント。
 * 全キーを `chrome.storage.local` に保持し、マイリンク同期対象の変更には変更スタンプを付ける。
 */

import { isPortalSyncedStorageKey } from '../../contract/portal-synced-storage';
import { chromeStorageClient } from './chrome-storage-client';
import { removePortalSyncedValues, writePortalSyncedValues } from './portal-sync-ledger';

function normalizeKeys(keys: string | string[]): string[] {
  return Array.isArray(keys) ? keys : [keys];
}

function splitKeys(keys: readonly string[]): { synced: string[]; local: string[] } {
  const synced: string[] = [];
  const local: string[] = [];
  for (const key of keys) {
    if (isPortalSyncedStorageKey(key)) synced.push(key);
    else local.push(key);
  }
  return { synced, local };
}

function splitObject(obj: Record<string, unknown>): {
  synced: Record<string, unknown>;
  local: Record<string, unknown>;
} {
  const synced: Record<string, unknown> = {};
  const local: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isPortalSyncedStorageKey(key)) synced[key] = value;
    else local[key] = value;
  }
  return { synced, local };
}

export const storageClient = {
  get(keys: string | string[]): Promise<Record<string, unknown>> {
    return chromeStorageClient.get(normalizeKeys(keys));
  },

  async set(obj: Record<string, unknown>): Promise<void> {
    const { synced, local } = splitObject(obj);
    await Promise.all([
      Object.keys(synced).length > 0 ? writePortalSyncedValues(synced) : Promise.resolve(),
      Object.keys(local).length > 0 ? chromeStorageClient.set(local) : Promise.resolve(),
    ]);
  },

  /**
   * 自動生成した初期値を保存する。同期対象キーは「どの実際の変更にも負ける」扱いになり、
   * 他の端末に値があればそちらが優先される。
   */
  async setDefaults(obj: Record<string, unknown>): Promise<void> {
    const { synced, local } = splitObject(obj);
    await Promise.all([
      Object.keys(synced).length > 0
        ? writePortalSyncedValues(synced, { weak: true })
        : Promise.resolve(),
      Object.keys(local).length > 0 ? chromeStorageClient.set(local) : Promise.resolve(),
    ]);
  },

  async remove(keys: string | string[]): Promise<void> {
    const keyList = normalizeKeys(keys);
    const { synced, local } = splitKeys(keyList);
    await Promise.all([
      synced.length > 0 ? removePortalSyncedValues(synced) : Promise.resolve(),
      local.length > 0 ? chromeStorageClient.remove(local) : Promise.resolve(),
    ]);
  },

  onChanged(
    listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void,
  ): () => void {
    return chromeStorageClient.onChanged((changes, area) => {
      if (area !== 'local') return;
      listener(changes, area);
    });
  },
};

export default storageClient;
