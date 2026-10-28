/**
 * マイリンク同期対象キーの端末内台帳（`chrome.storage.local`）。
 *
 * 設定値は従来どおり個別キーに保存し、隣に「いつ・どの端末で変えたか」の
 * スタンプを持たせる。値とスタンプは1回の `set` で同時に書くため、
 * どのページ・ポップアップから書いても片方だけが残ることはない。
 */

import {
  isPortalSyncedStorageKey,
  PORTAL_SYNC_HOUSEKEEPING_KEYS,
  PORTAL_SYNCED_STORAGE_KEYS,
} from '../../contract/portal-synced-storage';
import { SK } from '../../contract/storage-keys';
import {
  buildPortalSyncDoc,
  isPortalSyncCollectionKey,
  maxPortalSyncStampTime,
  parsePortalSyncEntryId,
  portalSyncDocToStorage,
  portalSyncItemEntryId,
  stablePortalSyncJson,
  stampPortalSyncChange,
  WEAK_PORTAL_SYNC_STAMP,
  type PortalSyncDoc,
  type PortalSyncEntry,
  type PortalSyncStamp,
} from '../../domain/portal-sync-doc';
import { LEGACY_DEFAULT_UI_FONT } from '../../domain/ui-font';
import { chromeStorageClient } from './chrome-storage-client';
import { parseSyncViaMyLinks } from './parsers';

export const PORTAL_SYNC_STAMP_KEY_PREFIX = 'portalThemeSyncStamp:';
export const PORTAL_SYNC_DEVICE_KEY = 'portalThemeSyncDevice';
export const PORTAL_SYNC_LEDGER_KEY = 'portalThemeSyncLedger';
/** 既定テーマが変わる前（〜7.1）の既定テーマ */
const LEGACY_DEFAULT_THEME = 'dark';
/** 旧実装の端末キャッシュ状態（移行後に削除） */
export const LEGACY_PORTAL_SYNC_CACHE_META_KEY = 'portalThemePortalSyncCacheMeta';

export interface PortalSyncLedgerMeta {
  version: 1;
  /** この端末が結び付いている同期スペース（ポータルアカウントのデータ） */
  space: string | null;
  /** 次の同期でポータル側をそのまま採用する（旧版からの移行直後） */
  adoptRemote: boolean;
  /** 最後に同期が完了した時点の最新スタンプ。これより新しい変更が「未送信」 */
  syncedClock: number;
}

const DEFAULT_LEDGER: PortalSyncLedgerMeta = {
  version: 1,
  space: null,
  adoptRemote: false,
  syncedClock: 0,
};

/** 保存形式: [t, 端末] または削除なら [t, 端末, 1] */
type StoredStamp = [number, string] | [number, string, 1];
type StoredCollectionStamps = Record<string, StoredStamp>;

export function portalSyncStampKey(key: string): string {
  return `${PORTAL_SYNC_STAMP_KEY_PREFIX}${key}`;
}

export function isPortalSyncLedgerKey(key: string): boolean {
  return key.startsWith(PORTAL_SYNC_STAMP_KEY_PREFIX) || key === PORTAL_SYNC_LEDGER_KEY;
}

const ALL_STAMP_KEYS = PORTAL_SYNCED_STORAGE_KEYS.map(portalSyncStampKey);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseStoredStamp(raw: unknown): { s: PortalSyncStamp; del: boolean } | null {
  if (!Array.isArray(raw) || typeof raw[0] !== 'number' || typeof raw[1] !== 'string') return null;
  if (!Number.isFinite(raw[0])) return null;
  return { s: { t: raw[0], d: raw[1] }, del: raw[2] === 1 };
}

function toStoredStamp(entry: PortalSyncEntry): StoredStamp {
  return entry.del ? [entry.s.t, entry.s.d, 1] : [entry.s.t, entry.s.d];
}

export function parsePortalSyncLedgerMeta(raw: unknown): PortalSyncLedgerMeta | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  return {
    version: 1,
    space: typeof raw.space === 'string' && raw.space ? raw.space : null,
    adoptRemote: raw.adoptRemote === true,
    syncedClock:
      typeof raw.syncedClock === 'number' && Number.isFinite(raw.syncedClock) ? raw.syncedClock : 0,
  };
}

let deviceIdPromise: Promise<string> | null = null;

function randomBase36(length: number): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('');
}

export function createPortalSyncId(length = 8): string {
  return randomBase36(length);
}

/** この端末（ブラウザプロファイル）の同期用 ID */
export function getPortalSyncDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      const snap = await chromeStorageClient.get(PORTAL_SYNC_DEVICE_KEY);
      const stored = snap[PORTAL_SYNC_DEVICE_KEY];
      if (typeof stored === 'string' && stored) return stored;
      const created = randomBase36(6);
      await chromeStorageClient.set({ [PORTAL_SYNC_DEVICE_KEY]: created });
      // 別のページが同時に作っていたら、保存された方に揃える。
      const confirmed = (await chromeStorageClient.get(PORTAL_SYNC_DEVICE_KEY))[
        PORTAL_SYNC_DEVICE_KEY
      ];
      return typeof confirmed === 'string' && confirmed ? confirmed : created;
    })();
  }
  return deviceIdPromise;
}

function stampLookup(snapshot: Record<string, unknown>) {
  return (key: string, itemId: string | null) => {
    const raw = snapshot[portalSyncStampKey(key)];
    if (itemId === null) return parseStoredStamp(raw);
    return isRecord(raw) ? parseStoredStamp(raw[itemId]) : null;
  };
}

function docFromSnapshot(
  snapshot: Record<string, unknown>,
  keys: readonly string[],
): PortalSyncDoc {
  const lookup = stampLookup(snapshot);
  const doc: Record<string, PortalSyncEntry> = { ...buildPortalSyncDoc(keys, snapshot, lookup) };
  // 値を消したコレクションの墓標は値側に残らないので、スタンプ側から拾う。
  for (const key of keys) {
    if (!isPortalSyncCollectionKey(key)) continue;
    const stamps = snapshot[portalSyncStampKey(key)];
    if (!isRecord(stamps)) continue;
    for (const [itemId, raw] of Object.entries(stamps)) {
      const stamp = parseStoredStamp(raw);
      const id = portalSyncItemEntryId(key, itemId);
      if (stamp?.del && !doc[id]) doc[id] = { s: stamp.s, del: true };
    }
  }
  return doc;
}

/** 旧版の端末キャッシュの状態（なければ null） */
function readLegacyCache(raw: unknown): { updatedAt: number; dirty: boolean } | null {
  if (!isRecord(raw)) return null;
  const updatedAt =
    typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0;
  return { updatedAt, dirty: raw.dirty === true };
}

/**
 * 新しい既定値（同期オフ・パウダー）は新規インストールにだけ使い、既存の利用者は今の状態を保つ。
 * - 旧版で同期していた人（未設定＝オンだった）は同期を続ける
 * - テーマ・フォントを選んだことのない既存の利用者は、旧既定（ダーク・標準フォント）のまま
 *   （スタンプなしで書くので、他の端末で選んだテーマがあればそちらが優先される）
 */
function keepExistingUserDefaults(
  snap: Record<string, unknown>,
  hasLegacyCache: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (snap[SK.syncViaMyLinks] === undefined && hasLegacyCache) out[SK.syncViaMyLinks] = true;
  const existingUser =
    hasLegacyCache ||
    snap[SK.portalGuidedTourDone] === true ||
    snap[SK.portalLanguagePickerDone] === true;
  if (existingUser && snap[SK.theme] === undefined) out[SK.theme] = LEGACY_DEFAULT_THEME;
  if (existingUser && snap[SK.font] === undefined) out[SK.font] = LEGACY_DEFAULT_UI_FONT;
  return out;
}

/** 旧実装（端末キャッシュ + dirty 印）からの移行。何度実行しても同じ結果になる。 */
async function migrateLegacyCache(): Promise<void> {
  const snap = await chromeStorageClient.get([
    PORTAL_SYNC_LEDGER_KEY,
    LEGACY_PORTAL_SYNC_CACHE_META_KEY,
    SK.syncViaMyLinks,
    ...PORTAL_SYNCED_STORAGE_KEYS,
    ...ALL_STAMP_KEYS,
  ]);
  if (parsePortalSyncLedgerMeta(snap[PORTAL_SYNC_LEDGER_KEY])) return;

  const legacy = readLegacyCache(snap[LEGACY_PORTAL_SYNC_CACHE_META_KEY]);
  const out = keepExistingUserDefaults(snap, legacy !== null);
  const syncEnabled =
    out[SK.syncViaMyLinks] === true || parseSyncViaMyLinks(snap[SK.syncViaMyLinks]);

  // 未送信の変更があった端末だけ、手元の値を「その時刻の変更」として扱う。
  // 同期済みだった端末は、次回ポータル側を採用する（旧版と同じ挙動）。
  // 同期オフで使っていた端末は、いつ変えた値か分からないので「既定値」扱いにし、
  // 同期をオンにしたときポータルと違えば利用者に選んでもらう。
  const stampTime = syncEnabled && legacy?.dirty ? Math.max(1, legacy.updatedAt) : 0;
  const adoptRemote = syncEnabled && legacy !== null && !legacy.dirty;

  if (stampTime > 0) {
    const device = await getPortalSyncDeviceId();
    const stamp = { t: stampTime, d: device };
    for (const key of PORTAL_SYNCED_STORAGE_KEYS) {
      const entries = stampPortalSyncChange(key, undefined, snap[key], stamp);
      if (Object.keys(entries).length === 0) continue;
      out[portalSyncStampKey(key)] = stampStoreForKey(key, entries);
    }
  }
  out[PORTAL_SYNC_LEDGER_KEY] = { ...DEFAULT_LEDGER, adoptRemote } satisfies PortalSyncLedgerMeta;
  await chromeStorageClient.set(out);
  await chromeStorageClient.remove(LEGACY_PORTAL_SYNC_CACHE_META_KEY);
}

let ledgerReady: Promise<void> | null = null;

export function ensurePortalSyncLedger(): Promise<void> {
  if (!ledgerReady) {
    ledgerReady = migrateLegacyCache().catch((error: unknown) => {
      ledgerReady = null;
      throw error;
    });
  }
  return ledgerReady;
}

/** テスト用: モジュール内のキャッシュを捨てる */
export function resetPortalSyncLedgerForTests(): void {
  ledgerReady = null;
  deviceIdPromise = null;
}

function stampStoreForKey(
  key: string,
  entries: Record<string, PortalSyncEntry>,
  previous?: unknown,
): unknown {
  if (!isPortalSyncCollectionKey(key)) {
    const entry = entries[key];
    return entry ? toStoredStamp(entry) : previous;
  }
  const store: StoredCollectionStamps = isRecord(previous)
    ? { ...(previous as StoredCollectionStamps) }
    : {};
  for (const [id, entry] of Object.entries(entries)) {
    const { itemId } = parsePortalSyncEntryId(id);
    if (itemId !== null) store[itemId] = toStoredStamp(entry);
  }
  return store;
}

function keyStampFloor(key: string, raw: unknown): number {
  if (!isPortalSyncCollectionKey(key)) return parseStoredStamp(raw)?.s.t ?? 0;
  if (!isRecord(raw)) return 0;
  let max = 0;
  for (const value of Object.values(raw)) {
    const t = parseStoredStamp(value)?.s.t ?? 0;
    if (t > max) max = t;
  }
  return max;
}

export interface PortalSyncWriteOptions {
  /** 自動生成値など。どの実際の変更にも負けるスタンプで書く。 */
  weak?: boolean;
}

/**
 * ユーザー操作による同期対象キーの変更を保存する。
 * 変わった項目だけに新しいスタンプを付け、値と同じ `set` で保存する。
 */
export async function writePortalSyncedValues(
  values: Record<string, unknown>,
  options: PortalSyncWriteOptions = {},
): Promise<void> {
  const keys = Object.keys(values).filter(isPortalSyncedStorageKey);
  if (keys.length === 0) return;
  await ensurePortalSyncLedger();
  const [device, snap] = await Promise.all([
    getPortalSyncDeviceId(),
    chromeStorageClient.get([...keys, ...keys.map(portalSyncStampKey), PORTAL_SYNC_LEDGER_KEY]),
  ]);
  const syncedClock = parsePortalSyncLedgerMeta(snap[PORTAL_SYNC_LEDGER_KEY])?.syncedClock ?? 0;

  const out: Record<string, unknown> = {};
  const removed: string[] = [];
  for (const key of keys) {
    const stampKey = portalSyncStampKey(key);
    // 自分が見た最新の変更より必ず後になるスタンプを使う（端末の時計が遅れていても逆転しない）。
    const stamp = options.weak
      ? { ...WEAK_PORTAL_SYNC_STAMP, d: device }
      : {
          t: Math.max(Date.now(), keyStampFloor(key, snap[stampKey]) + 1, syncedClock + 1),
          d: device,
        };
    const next = values[key];
    const entries = stampPortalSyncChange(key, snap[key], next, stamp);
    if (next === undefined) removed.push(key);
    else out[key] = next;
    if (Object.keys(entries).length > 0) {
      out[stampKey] = stampStoreForKey(key, entries, snap[stampKey]);
    }
  }
  if (removed.length > 0) await chromeStorageClient.remove(removed);
  if (Object.keys(out).length > 0) await chromeStorageClient.set(out);
}

/** 同期対象キーを削除し、削除も変更として記録する。 */
export async function removePortalSyncedValues(keys: readonly string[]): Promise<void> {
  const synced = keys.filter(isPortalSyncedStorageKey);
  if (synced.length === 0) return;
  await writePortalSyncedValues(Object.fromEntries(synced.map((key) => [key, undefined])));
}

export interface LocalPortalSyncState {
  doc: PortalSyncDoc;
  meta: PortalSyncLedgerMeta;
}

export async function readLocalPortalSyncState(): Promise<LocalPortalSyncState> {
  await ensurePortalSyncLedger();
  const snap = await chromeStorageClient.get([
    ...PORTAL_SYNCED_STORAGE_KEYS,
    ...ALL_STAMP_KEYS,
    PORTAL_SYNC_LEDGER_KEY,
  ]);
  return {
    doc: docFromSnapshot(snap, PORTAL_SYNCED_STORAGE_KEYS),
    meta: parsePortalSyncLedgerMeta(snap[PORTAL_SYNC_LEDGER_KEY]) ?? { ...DEFAULT_LEDGER },
  };
}

/** まだ同期できていない変更があるか */
export async function hasPendingPortalSyncChanges(): Promise<boolean> {
  const { doc, meta } = await readLocalPortalSyncState();
  return maxPortalSyncStampTime(doc) > meta.syncedClock;
}

/** まだ送っていない変更の数（設定1つ・予定1件をそれぞれ1件と数える） */
export async function countPendingPortalSyncChanges(): Promise<number> {
  const { doc, meta } = await readLocalPortalSyncState();
  let count = 0;
  for (const [id, entry] of Object.entries(doc)) {
    if (entry.s.t <= meta.syncedClock) continue;
    if (PORTAL_SYNC_HOUSEKEEPING_KEYS.has(parsePortalSyncEntryId(id).key)) continue;
    count += 1;
  }
  return count;
}

/**
 * 指定キーの値とスタンプを、状態 `doc` の内容で置き換える。
 * 状態にエントリがないキーは値ごと削除する。
 */
export async function commitLocalPortalSyncDoc(
  doc: PortalSyncDoc,
  keys: Iterable<string>,
): Promise<void> {
  const target = new Set([...keys].filter(isPortalSyncedStorageKey));
  if (target.size === 0) return;

  const byKey = new Map<string, Record<string, PortalSyncEntry>>();
  for (const [id, entry] of Object.entries(doc)) {
    const { key } = parsePortalSyncEntryId(id);
    if (!target.has(key)) continue;
    const entries = byKey.get(key) ?? {};
    entries[id] = entry;
    byKey.set(key, entries);
  }

  const { values, removed } = portalSyncDocToStorage(doc);
  const out: Record<string, unknown> = {};
  const toRemove: string[] = [];
  for (const key of target) {
    const entries = byKey.get(key);
    if (!entries) {
      toRemove.push(key, portalSyncStampKey(key));
      continue;
    }
    if (removed.includes(key) || values[key] === undefined) toRemove.push(key);
    else out[key] = values[key];
    const weakOnly = Object.values(entries).every((entry) => entry.s.t === 0 && !entry.del);
    if (weakOnly && !isPortalSyncCollectionKey(key)) toRemove.push(portalSyncStampKey(key));
    else out[portalSyncStampKey(key)] = stampStoreForKey(key, entries);
  }
  if (Object.keys(out).length > 0) await chromeStorageClient.set(out);
  if (toRemove.length > 0) await chromeStorageClient.remove(toRemove);
}

export async function readPortalSyncLedgerMeta(): Promise<PortalSyncLedgerMeta> {
  await ensurePortalSyncLedger();
  const snap = await chromeStorageClient.get(PORTAL_SYNC_LEDGER_KEY);
  return parsePortalSyncLedgerMeta(snap[PORTAL_SYNC_LEDGER_KEY]) ?? { ...DEFAULT_LEDGER };
}

export async function updatePortalSyncLedgerMeta(
  patch: Partial<Omit<PortalSyncLedgerMeta, 'version'>>,
): Promise<PortalSyncLedgerMeta> {
  const current = await readPortalSyncLedgerMeta();
  const next: PortalSyncLedgerMeta = { ...current, ...patch, version: 1 };
  await chromeStorageClient.set({ [PORTAL_SYNC_LEDGER_KEY]: next });
  return next;
}

/* ── 同期前の自動バックアップ ── */

export const PORTAL_SYNC_BACKUPS_KEY = 'portalThemeSyncBackups';
/** 残すバックアップの数 */
export const PORTAL_SYNC_BACKUP_LIMIT = 10;

/**
 * - sync: 同期で他の端末の変更を反映した
 * - choice: 「ポータルに合わせる」を選んだ
 * - restore: バックアップから戻した（戻す前の状態）
 */
export type PortalSyncBackupReason = 'sync' | 'choice' | 'restore';

export interface PortalSyncBackup {
  id: string;
  at: number;
  reason: PortalSyncBackupReason;
  /** 利用者の内容（管理用の記録は含めない） */
  values: Record<string, unknown>;
}

const RESTORABLE_KEYS = PORTAL_SYNCED_STORAGE_KEYS.filter(
  (key) => !PORTAL_SYNC_HOUSEKEEPING_KEYS.has(key),
);

function parseBackups(raw: unknown): PortalSyncBackup[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is PortalSyncBackup =>
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.at === 'number' &&
      (item.reason === 'sync' || item.reason === 'choice' || item.reason === 'restore') &&
      isRecord(item.values),
  );
}

export async function listPortalSyncBackups(): Promise<PortalSyncBackup[]> {
  const snap = await chromeStorageClient.get(PORTAL_SYNC_BACKUPS_KEY);
  return parseBackups(snap[PORTAL_SYNC_BACKUPS_KEY]).sort((a, b) => b.at - a.at);
}

/** 今の内容をバックアップに残す。直前のバックアップと同じなら何もしない。 */
export async function backupLocalPortalSyncState(reason: PortalSyncBackupReason): Promise<void> {
  const snap = await chromeStorageClient.get([...RESTORABLE_KEYS, PORTAL_SYNC_BACKUPS_KEY]);
  const values: Record<string, unknown> = {};
  for (const key of RESTORABLE_KEYS) {
    if (snap[key] !== undefined) values[key] = snap[key];
  }
  const backups = parseBackups(snap[PORTAL_SYNC_BACKUPS_KEY]).sort((a, b) => b.at - a.at);
  if (backups[0] && stablePortalSyncJson(backups[0].values) === stablePortalSyncJson(values)) {
    return;
  }
  const next: PortalSyncBackup = {
    id: createPortalSyncId(10),
    at: Math.max(Date.now(), (backups[0]?.at ?? 0) + 1),
    reason,
    values,
  };
  await chromeStorageClient.set({
    [PORTAL_SYNC_BACKUPS_KEY]: [next, ...backups].slice(0, PORTAL_SYNC_BACKUP_LIMIT),
  });
}

/**
 * バックアップの内容に戻す。戻す操作は通常の変更として記録されるので、
 * 同期がオンなら他の端末にも広がる。戻す前の状態もバックアップに残す。
 */
export async function restorePortalSyncBackup(id: string): Promise<boolean> {
  const backup = (await listPortalSyncBackups()).find((item) => item.id === id);
  if (!backup) return false;
  await backupLocalPortalSyncState('restore');
  await writePortalSyncedValues(
    Object.fromEntries(RESTORABLE_KEYS.map((key) => [key, backup.values[key]])),
  );
  return true;
}
