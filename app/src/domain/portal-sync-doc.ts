/**
 * マイリンク同期の状態モデル（純粋関数のみ）。
 *
 * 同期対象を「エントリ」の集合として扱う。エントリは設定キー1つ、または
 * 追加予定・カスタムテーマの1件に対応し、それぞれ更新スタンプを持つ。
 *
 * 2つの状態の統合はエントリごとに「スタンプが新しい方」を採用するだけなので、
 * 統合の順番・回数・重複に関係なく同じ結果になる（可換・結合的・冪等）。
 * そのため、どの端末がどの順で同期しても最終的に必ず同じ状態へ収束する。
 */

import { SK } from '../contract/storage-keys';

/** 更新スタンプ。t は時刻ベースの論理時計（ms）、d は端末 ID（同時刻の決着用）。 */
export interface PortalSyncStamp {
  t: number;
  d: string;
}

/** 既定値や自動生成値など、どの実際の変更にも負けるスタンプ。 */
export const WEAK_PORTAL_SYNC_STAMP: PortalSyncStamp = { t: 0, d: '' };

export interface PortalSyncEntry {
  s: PortalSyncStamp;
  /** del のときは持たない */
  v?: unknown;
  /** 削除済み（墓標）。削除も「変更」として他端末へ伝える。 */
  del?: true;
}

/** エントリ ID → エントリ */
export type PortalSyncDoc = Readonly<Record<string, PortalSyncEntry>>;

/** 1件ずつ統合するコレクション（storage キー → 配列フィールド名） */
export const PORTAL_SYNC_COLLECTIONS: Readonly<Record<string, 'themes' | 'events'>> = {
  [SK.customThemes]: 'themes',
  [SK.customCalEvents]: 'events',
};

/** 墓標を保持する期間。これより古い削除記録は統合結果から決定的に取り除く。 */
export const PORTAL_SYNC_TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

const ITEM_SEPARATOR = '\u001f';

export function isPortalSyncCollectionKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(PORTAL_SYNC_COLLECTIONS, key);
}

export function portalSyncItemEntryId(key: string, itemId: string): string {
  return `${key}${ITEM_SEPARATOR}${itemId}`;
}

export function parsePortalSyncEntryId(id: string): { key: string; itemId: string | null } {
  const at = id.indexOf(ITEM_SEPARATOR);
  if (at < 0) return { key: id, itemId: null };
  return { key: id.slice(0, at), itemId: id.slice(at + 1) };
}

export function comparePortalSyncStamps(a: PortalSyncStamp, b: PortalSyncStamp): number {
  if (a.t !== b.t) return a.t < b.t ? -1 : 1;
  if (a.d === b.d) return 0;
  return a.d < b.d ? -1 : 1;
}

/** キー順に依存しない JSON 文字列（比較・決着用） */
export function stablePortalSyncJson(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stablePortalSyncJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stablePortalSyncJson(record[key])}`).join(',')}}`;
}

function entryContent(entry: PortalSyncEntry): string {
  return entry.del ? '\u0000del' : stablePortalSyncJson(entry.v);
}

/** 2エントリの勝敗。スタンプ → 内容の順で決めるので、どちら側で比べても同じ結果。 */
export function comparePortalSyncEntries(a: PortalSyncEntry, b: PortalSyncEntry): number {
  const byStamp = comparePortalSyncStamps(a.s, b.s);
  if (byStamp !== 0) return byStamp;
  const ca = entryContent(a);
  const cb = entryContent(b);
  if (ca === cb) return 0;
  return ca < cb ? -1 : 1;
}

export function portalSyncEntriesEqual(a: PortalSyncEntry, b: PortalSyncEntry): boolean {
  return comparePortalSyncEntries(a, b) === 0;
}

/** 複数の状態を統合する。引数の順番に関係なく同じ結果を返す。 */
export function mergePortalSyncDocs(...docs: readonly PortalSyncDoc[]): PortalSyncDoc {
  const out: Record<string, PortalSyncEntry> = {};
  for (const doc of docs) {
    for (const [id, entry] of Object.entries(doc)) {
      const current = out[id];
      if (!current || comparePortalSyncEntries(entry, current) > 0) out[id] = entry;
    }
  }
  return out;
}

export function portalSyncDocsEqual(a: PortalSyncDoc, b: PortalSyncDoc): boolean {
  const aIds = Object.keys(a);
  if (aIds.length !== Object.keys(b).length) return false;
  for (const id of aIds) {
    const other = b[id];
    if (!other || !portalSyncEntriesEqual(a[id], other)) return false;
  }
  return true;
}

export function maxPortalSyncStampTime(doc: PortalSyncDoc): number {
  let max = 0;
  for (const entry of Object.values(doc)) {
    if (entry.s.t > max) max = entry.s.t;
  }
  return max;
}

/**
 * 古い墓標を取り除く。基準は端末の時計ではなく状態内の最新スタンプなので、
 * 同じ状態からはどの端末でも同じ結果になる。
 */
export function prunePortalSyncTombstones(
  doc: PortalSyncDoc,
  ttlMs = PORTAL_SYNC_TOMBSTONE_TTL_MS,
): PortalSyncDoc {
  const cutoff = maxPortalSyncStampTime(doc) - ttlMs;
  const out: Record<string, PortalSyncEntry> = {};
  for (const [id, entry] of Object.entries(doc)) {
    if (entry.del && entry.s.t < cutoff) continue;
    out[id] = entry;
  }
  return out;
}

function itemIdOf(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const id = (item as { id?: unknown }).id;
  return typeof id === 'string' && id ? id : null;
}

function collectionItems(key: string, value: unknown): unknown[] {
  const field = PORTAL_SYNC_COLLECTIONS[key];
  if (!field || !value || typeof value !== 'object') return [];
  const items = (value as Record<string, unknown>)[field];
  return Array.isArray(items) ? items : [];
}

/** コレクション値 → itemId → item */
export function portalSyncCollectionItemMap(key: string, value: unknown): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const item of collectionItems(key, value)) {
    const id = itemIdOf(item);
    if (id && !out.has(id)) out.set(id, item);
  }
  return out;
}

function createdAtOf(item: unknown): string {
  const createdAt = (item as { createdAt?: unknown }).createdAt;
  return typeof createdAt === 'string' ? createdAt : '';
}

/** 端末によらず同じ並びになるよう、作成日時 → ID 順に並べる。 */
function sortCollectionItems(items: unknown[]): unknown[] {
  return [...items].sort((a, b) => {
    const ca = createdAtOf(a);
    const cb = createdAtOf(b);
    if (ca !== cb) return ca < cb ? -1 : 1;
    const ia = itemIdOf(a) ?? '';
    const ib = itemIdOf(b) ?? '';
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
}

export function buildPortalSyncCollectionValue(key: string, items: unknown[]): unknown {
  const field = PORTAL_SYNC_COLLECTIONS[key];
  return { schemaVersion: 1, [field]: sortCollectionItems(items) };
}

/** 状態 → storage に書く値と削除するキー */
export function portalSyncDocToStorage(doc: PortalSyncDoc): {
  values: Record<string, unknown>;
  removed: string[];
} {
  const values: Record<string, unknown> = {};
  const removed: string[] = [];
  const collections = new Map<string, unknown[]>();

  for (const [id, entry] of Object.entries(doc)) {
    const { key, itemId } = parsePortalSyncEntryId(id);
    if (itemId !== null) {
      if (!isPortalSyncCollectionKey(key)) continue;
      const items = collections.get(key) ?? [];
      if (!entry.del) items.push(entry.v);
      collections.set(key, items);
      continue;
    }
    if (entry.del) removed.push(key);
    else values[key] = entry.v;
  }

  for (const [key, items] of collections) {
    values[key] = buildPortalSyncCollectionValue(key, items);
  }
  return { values, removed };
}

/** 状態のうち、指定した storage キーに属するエントリだけを取り出す。 */
export function pickPortalSyncDocKeys(doc: PortalSyncDoc, keys: Iterable<string>): PortalSyncDoc {
  const wanted = new Set(keys);
  const out: Record<string, PortalSyncEntry> = {};
  for (const [id, entry] of Object.entries(doc)) {
    if (wanted.has(parsePortalSyncEntryId(id).key)) out[id] = entry;
  }
  return out;
}

/** 2つの状態で内容が異なる storage キー */
export function changedPortalSyncKeys(from: PortalSyncDoc, to: PortalSyncDoc): Set<string> {
  const keys = new Set<string>();
  for (const id of new Set([...Object.keys(from), ...Object.keys(to)])) {
    const a = from[id];
    const b = to[id];
    if (a && b && portalSyncEntriesEqual(a, b)) continue;
    keys.add(parsePortalSyncEntryId(id).key);
  }
  return keys;
}

/**
 * storage の値と、キー/アイテムごとのスタンプから状態を組み立てる。
 * スタンプのない値は WEAK（どの変更にも負ける）として扱う。
 */
export function buildPortalSyncDoc(
  keys: readonly string[],
  values: Record<string, unknown>,
  stampFor: (key: string, itemId: string | null) => { s: PortalSyncStamp; del?: boolean } | null,
): PortalSyncDoc {
  const out: Record<string, PortalSyncEntry> = {};
  for (const key of keys) {
    const value = values[key];
    if (isPortalSyncCollectionKey(key)) {
      const items = portalSyncCollectionItemMap(key, value);
      for (const [itemId, item] of items) {
        const stamp = stampFor(key, itemId);
        out[portalSyncItemEntryId(key, itemId)] = {
          s: stamp?.s ?? WEAK_PORTAL_SYNC_STAMP,
          v: item,
        };
      }
      continue;
    }
    const stamp = stampFor(key, null);
    if (value !== undefined) {
      out[key] = { s: stamp?.s ?? WEAK_PORTAL_SYNC_STAMP, v: value };
    } else if (stamp?.del) {
      out[key] = { s: stamp.s, del: true };
    }
  }
  return out;
}

/**
 * 1キー分のローカル変更を、変わったエントリだけ新しいスタンプ付きで返す。
 * コレクションは1件ずつ比較し、消えた項目は墓標にする。
 */
export function stampPortalSyncChange(
  key: string,
  previous: unknown,
  next: unknown,
  stamp: PortalSyncStamp,
): Record<string, PortalSyncEntry> {
  const out: Record<string, PortalSyncEntry> = {};
  if (isPortalSyncCollectionKey(key)) {
    const before = portalSyncCollectionItemMap(key, previous);
    const after = portalSyncCollectionItemMap(key, next);
    for (const [itemId, item] of after) {
      const old = before.get(itemId);
      if (old !== undefined && stablePortalSyncJson(old) === stablePortalSyncJson(item)) continue;
      out[portalSyncItemEntryId(key, itemId)] = { s: stamp, v: item };
    }
    for (const itemId of before.keys()) {
      if (!after.has(itemId)) out[portalSyncItemEntryId(key, itemId)] = { s: stamp, del: true };
    }
    return out;
  }
  if (next === undefined) {
    if (previous !== undefined) out[key] = { s: stamp, del: true };
    return out;
  }
  if (previous === undefined || stablePortalSyncJson(previous) !== stablePortalSyncJson(next)) {
    out[key] = { s: stamp, v: next };
  }
  return out;
}
