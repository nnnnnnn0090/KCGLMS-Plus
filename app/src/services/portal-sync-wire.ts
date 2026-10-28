/**
 * 同期状態（PortalSyncDoc）とマイリンクに載せる文字列の相互変換。
 *
 * 形式は従来の短縮ペイロード `{ v: 4, u, s }` に、エントリごとのスタンプ `x` を
 * 足したもの。旧版の拡張機能は `x` を無視して `s` を読めるため、更新途中の
 * 端末が混在しても設定値そのものは読み続けられる。
 */

import { PORTAL_SYNCED_STORAGE_KEYS } from '../contract/portal-synced-storage';
import {
  buildPortalSyncDoc,
  isPortalSyncCollectionKey,
  maxPortalSyncStampTime,
  parsePortalSyncEntryId,
  portalSyncCollectionItemMap,
  portalSyncDocToStorage,
  portalSyncItemEntryId,
  type PortalSyncDoc,
  type PortalSyncEntry,
} from '../domain/portal-sync-doc';
import {
  compactPortalSyncStorage,
  expandPortalSyncStorage,
  PORTAL_SYNC_PAYLOAD_VERSION,
  PORTAL_SYNC_SHORT_KEY,
} from '../lib/portal-sync-compact';
import {
  decryptPortalSyncPayload,
  encryptPortalSyncPayload,
  isEncryptedPortalSyncWire,
} from '../lib/portal-sync-crypto';
import { decodePortalSettingsPayloadJson } from './portal-settings-payload';

/**
 * スタンプ付き形式のバージョン。読めない変更を加えるときだけ上げる。
 * 自分より新しい形式を見つけた端末は、上書きせずに更新を促す。
 */
export const PORTAL_SYNC_DOC_FORMAT = 1;

/** 旧形式（スタンプなし）を読み込んだときの端末 ID */
export const LEGACY_PORTAL_SYNC_DEVICE = '~';

type WireStamp = [string, number] | [string, number, 1];

interface PortalSyncWireExtension {
  /** 形式バージョン */
  f: number;
  /** この書き込みの世代 ID */
  r: string;
  /** 同期スペース ID（ポータルアカウントごとのデータの識別） */
  sp: string;
  /** 端末 ID の一覧（e の添字で参照） */
  d: string[];
  /** 短縮エントリ ID → スタンプ */
  e: Record<string, WireStamp>;
}

export interface DecodedPortalSyncGeneration {
  doc: PortalSyncDoc;
  /** 旧形式（スタンプなし）なら null */
  rev: string | null;
  space: string | null;
}

export type PortalSyncWireDecodeResult =
  | { kind: 'ok'; generation: DecodedPortalSyncGeneration }
  | { kind: 'too-new' }
  | { kind: 'unreadable' };

const LONG_KEY_BY_SHORT = Object.fromEntries(
  Object.entries(PORTAL_SYNC_SHORT_KEY).map(([longKey, shortKey]) => [shortKey, longKey]),
);

function shortEntryId(id: string): string | null {
  const { key, itemId } = parsePortalSyncEntryId(id);
  const short = PORTAL_SYNC_SHORT_KEY[key];
  if (!short) return null;
  return itemId === null ? short : `${short}.${itemId}`;
}

function longEntryId(shortId: string): string | null {
  const dot = shortId.indexOf('.');
  const short = dot < 0 ? shortId : shortId.slice(0, dot);
  const key = LONG_KEY_BY_SHORT[short];
  if (!key) return null;
  if (dot < 0) return key;
  return isPortalSyncCollectionKey(key) ? portalSyncItemEntryId(key, shortId.slice(dot + 1)) : null;
}

/** 同期で実際に保存される形へ揃える（端末間で値を正しく比較するため）。 */
export function canonicalizePortalSyncDoc(doc: PortalSyncDoc): PortalSyncDoc {
  const { values } = portalSyncDocToStorage(doc);
  const canonical = expandPortalSyncStorage(compactPortalSyncStorage(values));
  const out: Record<string, PortalSyncEntry> = {};
  for (const [id, entry] of Object.entries(doc)) {
    if (entry.del) {
      out[id] = entry;
      continue;
    }
    const { key, itemId } = parsePortalSyncEntryId(id);
    if (itemId === null) {
      if (canonical[key] !== undefined) out[id] = { s: entry.s, v: canonical[key] };
      continue;
    }
    const item = portalSyncCollectionItemMap(key, canonical[key]).get(itemId);
    if (item !== undefined) out[id] = { s: entry.s, v: item };
  }
  return out;
}

export async function encodePortalSyncWire(
  doc: PortalSyncDoc,
  meta: { rev: string; space: string },
): Promise<string> {
  const { values } = portalSyncDocToStorage(doc);
  const devices: string[] = [];
  const deviceIndex = new Map<string, number>();
  const entries: Record<string, WireStamp> = {};

  for (const id of Object.keys(doc).sort()) {
    const entry = doc[id];
    const shortId = shortEntryId(id);
    if (!shortId) continue;
    let index = deviceIndex.get(entry.s.d);
    if (index === undefined) {
      index = devices.length;
      devices.push(entry.s.d);
      deviceIndex.set(entry.s.d, index);
    }
    const t = Math.max(0, Math.floor(entry.s.t)).toString(36);
    entries[shortId] = entry.del ? [t, index, 1] : [t, index];
  }

  const extension: PortalSyncWireExtension = {
    f: PORTAL_SYNC_DOC_FORMAT,
    r: meta.rev,
    sp: meta.space,
    d: devices,
    e: entries,
  };
  const json = JSON.stringify({
    v: PORTAL_SYNC_PAYLOAD_VERSION,
    u: Math.floor(maxPortalSyncStampTime(doc) / 1000),
    s: compactPortalSyncStorage(values),
    x: extension,
  });
  return (await encryptPortalSyncPayload(json)) ?? json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseExtension(raw: unknown): PortalSyncWireExtension | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.f !== 'number' || typeof raw.r !== 'string' || typeof raw.sp !== 'string') {
    return null;
  }
  if (!Array.isArray(raw.d) || !raw.d.every((d) => typeof d === 'string')) return null;
  if (!isRecord(raw.e)) return null;
  return raw as unknown as PortalSyncWireExtension;
}

function decodeExtensionDoc(
  storage: Record<string, unknown>,
  extension: PortalSyncWireExtension,
): PortalSyncDoc {
  const out: Record<string, PortalSyncEntry> = {};
  for (const [shortId, raw] of Object.entries(extension.e)) {
    if (!Array.isArray(raw) || typeof raw[0] !== 'string' || typeof raw[1] !== 'number') continue;
    const id = longEntryId(shortId);
    const device = extension.d[raw[1]];
    const t = parseInt(raw[0], 36);
    if (!id || device === undefined || !Number.isFinite(t)) continue;
    const s = { t, d: device };
    if (raw[2] === 1) {
      out[id] = { s, del: true };
      continue;
    }
    const { key, itemId } = parsePortalSyncEntryId(id);
    const value =
      itemId === null ? storage[key] : portalSyncCollectionItemMap(key, storage[key]).get(itemId);
    // 値が欠けたエントリは壊れているので採用しない（他の値は使う）。
    if (value !== undefined) out[id] = { s, v: value };
  }
  return out;
}

function decodeLegacy(json: string): PortalSyncDoc | null {
  const snapshot = decodePortalSettingsPayloadJson(json);
  if (!snapshot) return null;
  const stamp = { s: { t: Math.max(0, snapshot.updatedAt), d: LEGACY_PORTAL_SYNC_DEVICE } };
  return buildPortalSyncDoc(PORTAL_SYNCED_STORAGE_KEYS, snapshot.storage, () => stamp);
}

export async function decodePortalSyncWire(wire: string): Promise<PortalSyncWireDecodeResult> {
  const json = isEncryptedPortalSyncWire(wire) ? await decryptPortalSyncPayload(wire) : wire;
  if (!json) return { kind: 'unreadable' };

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { kind: 'unreadable' };
  }

  if (isRecord(raw) && raw.x !== undefined) {
    const extension = parseExtension(raw.x);
    if (!extension) return { kind: 'unreadable' };
    if (extension.f > PORTAL_SYNC_DOC_FORMAT) return { kind: 'too-new' };
    if (raw.v !== PORTAL_SYNC_PAYLOAD_VERSION || !isRecord(raw.s)) return { kind: 'unreadable' };
    let storage: Record<string, unknown>;
    try {
      storage = expandPortalSyncStorage(raw.s);
    } catch {
      return { kind: 'unreadable' };
    }
    return {
      kind: 'ok',
      generation: {
        doc: decodeExtensionDoc(storage, extension),
        rev: extension.r,
        space: extension.sp || null,
      },
    };
  }

  const legacy = decodeLegacy(json);
  if (!legacy) return { kind: 'unreadable' };
  return { kind: 'ok', generation: { doc: legacy, rev: null, space: null } };
}
