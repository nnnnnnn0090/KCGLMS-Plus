/**
 * 拡張機能の状態をポータル「マイリンク」の biko フィールドへ保存する。
 *
 * マーカーリンク（midashi: __KCGLMS::{n}）は UI から非表示。
 * biko は 200 文字制限のため、暗号化済みペイロードをチャンク分割して複数行に載せる。
 */

import { SK } from '../contract/storage-keys';
import { PORTAL_HOSTNAME } from '../contract/origins';
import {
  isPortalSyncedStorageKey,
  pickPortalSyncedStorage,
  PORTAL_SYNCED_STORAGE_KEYS,
} from '../contract/portal-synced-storage';
import { storageClient } from '../platform/storage/client';
import { chromeStorageClient } from '../platform/storage/chrome-storage-client';
import { parseSyncViaMyLinks } from '../platform/storage/parsers';
import {
  decidePortalSyncBootstrap,
  markPortalSyncCacheClean,
  PORTAL_SYNC_CACHE_META_KEY,
  readPortalSyncCache,
  replacePortalSyncCache,
  type PortalSyncCacheMeta,
} from '../platform/storage/portal-sync-cache';
import { ensureClientUserIdInMemory, normalizeClientUserId } from '../lib/client-user-id';
import {
  fetchPortalUserLinks,
  nextPortalLinkNo,
  savePortalUserLinks,
  type PortalUserLink,
} from './user-html-link';
import {
  customThemesFromPortalStorage,
  decodePortalSettingsPayloadWire,
  defaultPortalSettingsStorage,
  encodePortalSettingsPayloadWire,
  settingsFromPortalStorage,
  type PortalExtensionSnapshot,
  type PortalSettingsSnapshot,
} from './portal-settings-payload';

/** マイリンク UI に表示しない設定用マーカー */
export const PORTAL_SETTINGS_MARKER_PREFIX = '__KCGLMS::';

/** ポータル側の biko 上限（Profile 保存 API の検証） */
export const PORTAL_SETTINGS_BIKO_MAX = 200;

/** チャンク分割時の安全マージン */
export const PORTAL_SETTINGS_CHUNK_MAX = 190;

/** マイリンクの同期用レコードを増やしすぎないための上限 */
export const PORTAL_SETTINGS_MARKER_MAX = 64;

const PORTAL_SETTINGS_URL_PREFIX = 'https://home.kcg.ac.jp/portal/_kcglms/';

export { PORTAL_SYNCED_STORAGE_KEYS, isPortalSyncedStorageKey };
export type { PortalExtensionSnapshot, PortalSettingsSnapshot };

let suppressPortalSync = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let listenerInstalled = false;
let bootstrapPromise: Promise<void> | null = null;
let portalSyncReady = false;
/** マイリンク同期トグル（未設定は true）。schedule の同期判定用 */
let myLinksSyncEnabledCache = true;
let myLinksSyncPreferenceInitialized = false;
let myLinksSyncTransition: Promise<void> = Promise.resolve();
/** マイリンクへの書き込みを直列化し、同期停止時の削除を最後に確定させる。 */
let portalSyncMutationQueue: Promise<void> = Promise.resolve();
/**
 * 同期オフ／マーカー削除のたびに進める。
 * 進行中の upload が削除後にマーカーを書き戻さないようにする。
 */
let portalSyncWriteEpoch = 0;

const PORTAL_EXTENSION_SAVE_DELAY_MS = 800;

function enqueuePortalSyncMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = portalSyncMutationQueue.then(mutation, mutation);
  portalSyncMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function isPortalSettingsMarkerLink(link: Pick<PortalUserLink, 'midashi' | 'url'>): boolean {
  return (
    link.midashi.startsWith(PORTAL_SETTINGS_MARKER_PREFIX) ||
    link.url.startsWith(PORTAL_SETTINGS_URL_PREFIX)
  );
}

function isOnPortalHost(): boolean {
  return typeof location !== 'undefined' && location.hostname === PORTAL_HOSTNAME;
}

async function readMyLinksSyncEnabled(): Promise<boolean> {
  const snap = await chromeStorageClient.get(SK.syncViaMyLinks);
  return parseSyncViaMyLinks(snap[SK.syncViaMyLinks]);
}

function canSyncPortalExtension(): boolean {
  return isOnPortalHost() && myLinksSyncPreferenceInitialized && myLinksSyncEnabledCache;
}

async function clearDirtyWithoutUpload(expectedEpoch: number): Promise<void> {
  const cache = await readPortalSyncCache();
  if (expectedEpoch !== portalSyncWriteEpoch || myLinksSyncEnabledCache) return;
  if (!cache.meta.dirty) return;
  await chromeStorageClient.set({
    [PORTAL_SYNC_CACHE_META_KEY]: {
      ...cache.meta,
      version: 1,
      dirty: false,
    } satisfies PortalSyncCacheMeta,
  });
}

async function markLocalCacheForSyncResume(expectedEpoch: number): Promise<boolean> {
  const cache = await readPortalSyncCache();
  if (expectedEpoch !== portalSyncWriteEpoch || !myLinksSyncEnabledCache) return false;
  await chromeStorageClient.set({
    [PORTAL_SYNC_CACHE_META_KEY]: {
      ...cache.meta,
      version: 1,
      updatedAt: Math.max(Date.now(), cache.meta.updatedAt + 1),
      dirty: true,
    } satisfies PortalSyncCacheMeta,
  });
  return expectedEpoch === portalSyncWriteEpoch && myLinksSyncEnabledCache;
}

async function applyPortalMyLinksSyncEnabled(enabled: boolean): Promise<void> {
  if (myLinksSyncPreferenceInitialized && myLinksSyncEnabledCache === enabled) {
    return myLinksSyncTransition;
  }

  const resumesLocalCache = myLinksSyncPreferenceInitialized && !myLinksSyncEnabledCache && enabled;
  myLinksSyncPreferenceInitialized = true;
  myLinksSyncEnabledCache = enabled;
  const writeEpoch = ++portalSyncWriteEpoch;
  portalSyncReady = false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  myLinksSyncTransition = (async () => {
    if (!enabled) {
      await clearDirtyWithoutUpload(writeEpoch);
      if (isOnPortalHost() && writeEpoch === portalSyncWriteEpoch) {
        await removePortalExtensionSyncFromMyLinks();
      }
      return;
    }

    if (!isOnPortalHost() || writeEpoch !== portalSyncWriteEpoch) return;
    installPortalExtensionSyncListener();
    if (resumesLocalCache && !(await markLocalCacheForSyncResume(writeEpoch))) return;
    const ready = await reconcilePortalExtensionCache(
      fetchPortalExtensionSnapshot,
      savePortalExtensionSnapshot,
    );
    if (!myLinksSyncEnabledCache || writeEpoch !== portalSyncWriteEpoch) {
      await removePortalExtensionSyncFromMyLinks();
      return;
    }
    portalSyncReady = ready;
    if (ready) {
      const cache = await readPortalSyncCache();
      if (cache.meta.dirty && myLinksSyncEnabledCache && writeEpoch === portalSyncWriteEpoch) {
        schedulePortalExtensionSync();
      }
    }
  })();

  return myLinksSyncTransition;
}

/**
 * マイリンク同期の有効/無効を切り替える（端末ローカル設定）。
 * 無効化時はポータル上の同期用マーカーも削除（soft-delete）する。
 * 再有効化すると、残っていなければ新規に同期データが作られる。
 */
export async function setPortalMyLinksSyncEnabled(enabled: boolean): Promise<void> {
  await chromeStorageClient.set({ [SK.syncViaMyLinks]: enabled });
  await applyPortalMyLinksSyncEnabled(enabled);
}

export async function getPortalMyLinksSyncEnabled(): Promise<boolean> {
  return readMyLinksSyncEnabled();
}

function snapshotOwnerId(snapshot: PortalExtensionSnapshot | null): string | null {
  return normalizeClientUserId(snapshot?.storage[SK.clientUserId]);
}

function markerMidashi(index: number): string {
  return `${PORTAL_SETTINGS_MARKER_PREFIX}${index}`;
}

function markerUrl(index: number): string {
  return `${PORTAL_SETTINGS_URL_PREFIX}${index}`;
}

function markerIndex(link: PortalUserLink): number {
  const fromTitle = link.midashi.slice(PORTAL_SETTINGS_MARKER_PREFIX.length);
  const parsed = Number(fromTitle);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  const fromUrl = link.url.slice(PORTAL_SETTINGS_URL_PREFIX.length);
  const parsedUrl = Number(fromUrl);
  return Number.isFinite(parsedUrl) && parsedUrl >= 0 ? parsedUrl : 0;
}

export async function writeSyncedLocalStorage(snapshot: PortalExtensionSnapshot): Promise<void> {
  suppressPortalSync = true;
  try {
    await replacePortalSyncCache(snapshot, snapshotOwnerId(snapshot), false);
  } finally {
    suppressPortalSync = false;
  }
}

function splitIntoChunks(text: string): string[] {
  if (!text) return [''];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += PORTAL_SETTINGS_CHUNK_MAX) {
    chunks.push(text.slice(i, i + PORTAL_SETTINGS_CHUNK_MAX));
  }
  return chunks;
}

export async function decodePortalExtensionSnapshot(
  links: readonly PortalUserLink[],
): Promise<PortalExtensionSnapshot | null> {
  const markers = links
    .filter((link) => !link.delFlg && isPortalSettingsMarkerLink(link))
    .sort((a, b) => markerIndex(a) - markerIndex(b));
  if (markers.length === 0 || markers.length > PORTAL_SETTINGS_MARKER_MAX) return null;
  for (const marker of markers) {
    if (marker.biko.length > PORTAL_SETTINGS_BIKO_MAX) return null;
  }
  return decodePortalSettingsPayloadWire(markers.map((marker) => marker.biko).join(''));
}

/** @deprecated PortalSettingsSnapshot 互換 */
export async function decodePortalSettingsSnapshot(
  links: readonly PortalUserLink[],
): Promise<PortalSettingsSnapshot | null> {
  const snapshot = await decodePortalExtensionSnapshot(links);
  if (!snapshot) return null;
  return {
    updatedAt: snapshot.updatedAt,
    settings: settingsFromPortalStorage(snapshot.storage),
    customThemes: customThemesFromPortalStorage(snapshot.storage),
  };
}

export async function applyPortalExtensionMarkers(
  links: readonly PortalUserLink[],
  snapshot: PortalExtensionSnapshot,
): Promise<PortalUserLink[]> {
  const chunks = splitIntoChunks(await encodePortalSettingsPayloadWire(snapshot));
  if (chunks.length > PORTAL_SETTINGS_MARKER_MAX) {
    throw new Error(
      `同期データが上限を超えました（${chunks.length}/${PORTAL_SETTINGS_MARKER_MAX}）`,
    );
  }
  const nonMarkers = links.filter((link) => !isPortalSettingsMarkerLink(link));
  const allMarkers = links.filter((link) => isPortalSettingsMarkerLink(link));
  const activeMarkers = allMarkers.filter((link) => !link.delFlg);
  const usedMarkers = new Set<PortalUserLink>();

  let nextLinkNo = nextPortalLinkNo(links);

  const updatedActiveMarkers: PortalUserLink[] = chunks.map((biko, index) => {
    const existing =
      activeMarkers.find((link) => markerIndex(link) === index && !usedMarkers.has(link)) ??
      allMarkers.find(
        (link) => link.delFlg && markerIndex(link) === index && !usedMarkers.has(link),
      );
    if (existing) {
      usedMarkers.add(existing);
      return {
        ...existing,
        midashi: markerMidashi(index),
        url: markerUrl(index),
        biko,
        delFlg: false,
      };
    }
    return {
      id: '',
      version: '',
      delFlg: false,
      linkNo: nextLinkNo++,
      midashi: markerMidashi(index),
      url: markerUrl(index),
      biko,
      order: -1,
    };
  });

  const retiredMarkers = activeMarkers
    .filter((link) => !usedMarkers.has(link))
    .map((link) => ({ ...link, delFlg: true }));

  const unchangedDeletedMarkers = allMarkers.filter(
    (link) => link.delFlg && !usedMarkers.has(link),
  );

  return [...nonMarkers, ...updatedActiveMarkers, ...retiredMarkers, ...unchangedDeletedMarkers];
}

/** 同期用マーカーをすべて soft-delete（ユーザーの通常マイリンクは残す） */
export function retireAllPortalExtensionMarkers(
  links: readonly PortalUserLink[],
): PortalUserLink[] {
  return links.map((link) =>
    isPortalSettingsMarkerLink(link) && !link.delFlg ? { ...link, delFlg: true } : link,
  );
}

async function removePortalExtensionSyncFromMyLinks(): Promise<boolean> {
  return enqueuePortalSyncMutation(async () => {
    const writeEpoch = portalSyncWriteEpoch;
    try {
      const links = await fetchPortalUserLinks();
      if (writeEpoch !== portalSyncWriteEpoch || myLinksSyncEnabledCache) return false;
      const next = retireAllPortalExtensionMarkers(links);
      const changed = next.some((link, index) => link.delFlg !== links[index]?.delFlg);
      if (!changed) return true;
      if (writeEpoch !== portalSyncWriteEpoch || myLinksSyncEnabledCache) return false;
      await savePortalUserLinks(next);
      return writeEpoch === portalSyncWriteEpoch && !myLinksSyncEnabledCache;
    } catch {
      return false;
    }
  });
}

export async function fetchPortalExtensionSnapshot(): Promise<PortalExtensionSnapshot | null> {
  const links = await fetchPortalUserLinks();
  return decodePortalExtensionSnapshot(links);
}

export async function savePortalExtensionSnapshot(
  snapshot: PortalExtensionSnapshot,
): Promise<void> {
  if (!myLinksSyncEnabledCache) return;
  await enqueuePortalSyncMutation(async () => {
    const writeEpoch = portalSyncWriteEpoch;
    if (!myLinksSyncEnabledCache) return;
    const links = await fetchPortalUserLinks();
    if (!myLinksSyncEnabledCache || writeEpoch !== portalSyncWriteEpoch) return;
    const next = await applyPortalExtensionMarkers(links, snapshot);
    if (!myLinksSyncEnabledCache || writeEpoch !== portalSyncWriteEpoch) return;
    await savePortalUserLinks(next);
  });
}

export async function persistDirtyPortalSyncCache(
  saveSnapshot: (snapshot: PortalExtensionSnapshot) => Promise<void>,
): Promise<boolean> {
  try {
    if (!myLinksSyncEnabledCache) return false;
    const writeEpoch = portalSyncWriteEpoch;
    const cache = await readPortalSyncCache();
    if (!cache.meta.dirty) return true;
    if (!myLinksSyncEnabledCache || writeEpoch !== portalSyncWriteEpoch) return false;
    const snapshot: PortalExtensionSnapshot = {
      updatedAt: cache.meta.updatedAt || Date.now(),
      storage: pickPortalSyncedStorage(cache.storage),
    };
    await saveSnapshot(snapshot);
    if (!myLinksSyncEnabledCache || writeEpoch !== portalSyncWriteEpoch) return false;
    suppressPortalSync = true;
    try {
      await markPortalSyncCacheClean(snapshot.updatedAt, snapshotOwnerId(snapshot));
    } finally {
      suppressPortalSync = false;
    }
    return true;
  } catch {
    /* 未ログイン等 */
    return false;
  }
}

export async function savePortalExtensionSyncNow(): Promise<boolean> {
  if (!canSyncPortalExtension()) return false;
  return persistDirtyPortalSyncCache(savePortalExtensionSnapshot);
}

export function schedulePortalExtensionSync(): void {
  if (suppressPortalSync || !portalSyncReady || !canSyncPortalExtension()) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void savePortalExtensionSyncNow();
  }, PORTAL_EXTENSION_SAVE_DELAY_MS);
}

export function installPortalExtensionSyncListener(): () => void {
  if (listenerInstalled) return () => undefined;
  listenerInstalled = true;
  return storageClient.onChanged((changes, area) => {
    if (area !== 'local' || suppressPortalSync) return;
    const syncPreferenceChange = changes[SK.syncViaMyLinks];
    if (syncPreferenceChange) {
      const enabled = parseSyncViaMyLinks(syncPreferenceChange.newValue);
      void applyPortalMyLinksSyncEnabled(enabled);
    }
    const relevant = Object.keys(changes).some(
      (key) => key === PORTAL_SYNC_CACHE_META_KEY || isPortalSyncedStorageKey(key),
    );
    if (!relevant) return;
    void readPortalSyncCache().then((cache) => {
      if (cache.meta.dirty) schedulePortalExtensionSync();
    });
  });
}

/** 起動時に1回だけ: マイリンク復元 → clientUserId 確定 → 必要なら保存 */
export function ensurePortalExtensionBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = runPortalExtensionBootstrap();
  }
  return bootstrapPromise;
}

/** @deprecated ensurePortalExtensionBootstrapped を使用 */
export async function bootstrapPortalExtensionSync(): Promise<void> {
  await ensurePortalExtensionBootstrapped();
}

async function runPortalExtensionBootstrap(): Promise<void> {
  if (!isOnPortalHost()) return;

  installPortalExtensionSyncListener();
  await applyPortalMyLinksSyncEnabled(await readMyLinksSyncEnabled());
}

/** ポータルAPIと端末キャッシュを照合する。戻り値はAPI取得に成功したか。 */
export async function reconcilePortalExtensionCache(
  fetchSnapshot: () => Promise<PortalExtensionSnapshot | null>,
  saveSnapshot: (snapshot: PortalExtensionSnapshot) => Promise<void>,
): Promise<boolean> {
  let portal: PortalExtensionSnapshot | null = null;
  try {
    portal = await fetchSnapshot();
  } catch {
    // API 取得失敗時は端末キャッシュだけで起動し、このページではアップロードしない。
    return false;
  }

  const cache = await readPortalSyncCache();
  const portalOwnerId = snapshotOwnerId(portal);
  const decision = decidePortalSyncBootstrap(portal, portalOwnerId, cache);

  if (portal) {
    if (decision === 'upload-local') {
      await persistDirtyPortalSyncCache(saveSnapshot);
      return true;
    }

    // マイリンクが新しい、所有者不一致、または旧版キャッシュならマイリンクを優先する。
    await writeSyncedLocalStorage(portal);
    if (!portalOwnerId) {
      await ensureClientUserIdInMemory();
      await persistDirtyPortalSyncCache(saveSnapshot);
    }
    return true;
  }

  // マーカーがない初回利用は旧版のローカル設定を移行し、空なら既定値を作成する。
  const initialStorage =
    Object.keys(cache.storage).length > 0 ? cache.storage : defaultPortalSettingsStorage();
  await replacePortalSyncCache(
    {
      updatedAt: Math.max(Date.now(), cache.meta.updatedAt + 1),
      storage: initialStorage,
    },
    cache.meta.ownerId,
    true,
  );
  await ensureClientUserIdInMemory();
  await persistDirtyPortalSyncCache(saveSnapshot);
  return true;
}

export {
  customThemesFromPortalStorage as parseCustomThemesFromExtensionStorage,
  settingsFromPortalStorage as parseSettingsFromExtensionStorage,
};
