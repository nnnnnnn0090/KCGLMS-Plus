/**
 * マイリンク同期の1回分の処理。
 *
 *   1. マイリンクを取得し、そろった世代をすべて読む
 *   2. 端末の状態と統合する（エントリごとに新しい方。順番によらず同じ結果）
 *   3. 統合結果を端末へ反映する
 *   4. ポータル側と違えば新しい世代として保存し、読み直して保存できたことを確かめる
 *
 * 失敗してもどちらの状態も壊さない。統合は何度やり直しても同じ結果なので、
 * 途中で止まっても次の同期で必ず追いつく。
 */

import { PORTAL_SYNC_HOUSEKEEPING_KEYS } from '../contract/portal-synced-storage';
import type { PortalSyncChoiceKind, PortalSyncIssue } from '../contract/portal-sync-status';
import {
  changedPortalSyncKeys,
  maxPortalSyncStampTime,
  mergePortalSyncDocs,
  parsePortalSyncEntryId,
  portalSyncDocsEqual,
  portalSyncEntriesEqual,
  prunePortalSyncTombstones,
  stablePortalSyncJson,
  WEAK_PORTAL_SYNC_STAMP,
  type PortalSyncDoc,
  type PortalSyncEntry,
} from '../domain/portal-sync-doc';
import type {
  LocalPortalSyncState,
  PortalSyncBackupReason,
  PortalSyncLedgerMeta,
} from '../platform/storage/portal-sync-ledger';
import {
  PORTAL_SETTINGS_MARKER_MAX,
  placePortalSyncMarkers,
  readPortalSyncMarkers,
  retireAllPortalSyncMarkers,
  splitPortalSyncWire,
  type PortalSyncRemoteRead,
} from './portal-sync-markers';
import { canonicalizePortalSyncDoc, encodePortalSyncWire } from './portal-sync-wire';
import { PortalUserLinksError, type PortalUserLink } from './user-html-link';

export interface PortalSyncIo {
  fetchLinks(): Promise<PortalUserLink[]>;
  saveLinks(links: readonly PortalUserLink[]): Promise<void>;
  withLock<T>(task: () => Promise<T>): Promise<T>;
  readLocal(): Promise<LocalPortalSyncState>;
  commitLocal(doc: PortalSyncDoc, keys: Iterable<string>): Promise<void>;
  /** 端末の内容を書き換える直前に、今の内容をバックアップする */
  backupLocal(reason: PortalSyncBackupReason): Promise<void>;
  updateMeta(patch: Partial<Omit<PortalSyncLedgerMeta, 'version'>>): Promise<PortalSyncLedgerMeta>;
  newId(): string;
}

/**
 * - normal: 通常の同期
 * - resume: ポータル側が空なら、この端末の内容で同期を始め直す（オンにしたとき）
 * - restart: ポータル側が空・読めないとき、この端末の内容で作り直す
 * - use-remote: 内容が違うとき、ポータル側に合わせる
 * - use-local: 内容が違うとき、この端末に合わせる
 */
export type PortalSyncMode = 'normal' | 'resume' | 'restart' | 'use-remote' | 'use-local';

export type PortalSyncResult =
  | {
      ok: true;
      wrote: boolean;
      usedRows: number;
      /** ほかの端末から受け取って、この端末に反映した変更（storage キー → 件数） */
      received: PortalSyncChangeCounts;
      /** この端末からポータルへ送った変更（storage キー → 件数） */
      sent: PortalSyncChangeCounts;
    }
  | {
      ok: false;
      issue: PortalSyncIssue;
      usedRows?: number;
      choice?: { kind: PortalSyncChoiceKind; replaced: number };
      /** 失敗の具体的な内容（問い合わせ・調査用） */
      detail?: string;
    };

/** 変わった項目の数を storage キーごとに数えたもの（管理用の記録は数えない） */
export type PortalSyncChangeCounts = Record<string, number>;

/** `from` → `to` で変わった利用者の内容を、storage キーごとに数える */
export function countPortalSyncChanges(
  from: PortalSyncDoc,
  to: PortalSyncDoc,
): PortalSyncChangeCounts {
  const counts: PortalSyncChangeCounts = {};
  for (const id of new Set([...Object.keys(from), ...Object.keys(to)])) {
    const a = from[id];
    const b = to[id];
    if (a && b && portalSyncEntriesEqual(a, b)) continue;
    // 削除済み同士（墓標の更新だけ）は利用者から見て変化がない。
    if ((!a || a.del) && (!b || b.del)) continue;
    if (!isUserContentEntry(id)) continue;
    const { key } = parsePortalSyncEntryId(id);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** 保存が他の書き込みと重なったときのやり直し回数 */
const MAX_WRITE_ATTEMPTS = 3;

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * 失敗を理由に分類する。ポータル API 以外の例外（拡張機能の不具合など）は
 * 通信エラーと誤表示しないよう unexpected にし、内容を detail に残す。
 */
export function portalSyncFailure(error: unknown): Extract<PortalSyncResult, { ok: false }> {
  if (error instanceof PortalUserLinksError) {
    const issue: PortalSyncIssue =
      error.reason === 'signed-out'
        ? 'signed-out'
        : error.reason === 'rejected'
          ? 'save-failed'
          : 'network';
    return { ok: false, issue, detail: error.message };
  }
  return { ok: false, issue: 'unexpected', detail: describeUnknownError(error) };
}

function isUserContentEntry(id: string): boolean {
  return !PORTAL_SYNC_HOUSEKEEPING_KEYS.has(parsePortalSyncEntryId(id).key);
}

/** `from` にあった利用者の内容のうち、`to` で消える・変わるものの数 */
export function countReplacedPortalSyncEntries(from: PortalSyncDoc, to: PortalSyncDoc): number {
  let count = 0;
  for (const [id, entry] of Object.entries(from)) {
    if (entry.del || !isUserContentEntry(id)) continue;
    const next = to[id];
    if (!next || next.del || stablePortalSyncJson(next.v) !== stablePortalSyncJson(entry.v)) {
      count += 1;
    }
  }
  return count;
}

/** 統合結果を端末へ反映する。直前に読み直し、その間の変更も取りこぼさない。 */
async function applyToLocal(
  io: PortalSyncIo,
  target: PortalSyncDoc,
  options: { replace: boolean; reason: PortalSyncBackupReason },
): Promise<PortalSyncChangeCounts> {
  const fresh = canonicalizePortalSyncDoc((await io.readLocal()).doc);
  const next = options.replace ? target : mergePortalSyncDocs(target, fresh);
  const keys = changedPortalSyncKeys(fresh, next);
  if (keys.size === 0) return {};
  // 端末にあった内容が消える・変わるときは、書き換える前にバックアップを取る。
  if (countReplacedPortalSyncEntries(fresh, next) > 0) await io.backupLocal(options.reason);
  await io.commitLocal(next, keys);
  return countPortalSyncChanges(fresh, next);
}

/** 端末の内容をすべて「どの変更にも負ける」扱いにする（ポータル側を優先した統合用） */
function weakenPortalSyncDoc(doc: PortalSyncDoc): PortalSyncDoc {
  const out: Record<string, PortalSyncEntry> = {};
  for (const [id, entry] of Object.entries(doc)) {
    if (!entry.del) out[id] = { s: WEAK_PORTAL_SYNC_STAMP, v: entry.v };
  }
  return out;
}

/**
 * この端末の内容をそのまま正とする状態を作る。ポータル側より新しいスタンプを付け、
 * ポータルにしかない項目は削除として記録する。
 */
function takeOverPortalSyncDoc(local: PortalSyncDoc, remote: PortalSyncDoc, device: string) {
  const s = {
    t: Math.max(maxPortalSyncStampTime(local), maxPortalSyncStampTime(remote)) + 1,
    d: device,
  };
  const out: Record<string, PortalSyncEntry> = {};
  for (const [id, entry] of Object.entries(local)) {
    out[id] = entry.del ? { s, del: true } : { s, v: entry.v };
  }
  for (const id of Object.keys(remote)) {
    if (!out[id]) out[id] = { s, del: true };
  }
  return out;
}

interface SyncPlan {
  target: PortalSyncDoc;
  space: string;
  needsWrite: boolean;
  usedRows: number;
  received: PortalSyncChangeCounts;
  sent: PortalSyncChangeCounts;
}

/** 同期を止めるべき状態か（止めるなら理由を返す） */
function blockingIssue(
  remote: PortalSyncRemoteRead,
  meta: PortalSyncLedgerMeta,
  mode: PortalSyncMode,
): PortalSyncIssue | null {
  if (remote.kind === 'too-new') return 'too-new';
  if (remote.kind === 'unreadable' && mode !== 'restart') return 'unreadable';
  // 同期したことのある端末なのにデータがない = 他の端末で削除された、または別アカウント。
  // 勝手に作り直さず、利用者に確認する（オンにし直した・作り直しを選んだときは進める）。
  if (remote.kind === 'empty' && meta.space !== null && mode === 'normal') return 'remote-missing';
  return null;
}

type RemoteOk = Extract<PortalSyncRemoteRead, { kind: 'ok' }>;

/**
 * ポータルにデータがあるときの統合結果。黙って端末の内容を置き換えることになる場合は、
 * 利用者に選んでもらうため choice を返す。
 */
function decideTarget(
  remote: RemoteOk,
  local: LocalPortalSyncState,
  localDoc: PortalSyncDoc,
  mode: PortalSyncMode,
  newId: () => string,
):
  | { target: PortalSyncDoc; reason: PortalSyncBackupReason; replace: boolean }
  | { choice: { kind: PortalSyncChoiceKind; replaced: number } } {
  const otherAccount =
    remote.space !== null && local.meta.space !== null && remote.space !== local.meta.space;

  if (mode === 'use-local') {
    return {
      target: takeOverPortalSyncDoc(localDoc, remote.doc, newId()),
      reason: 'choice',
      replace: true,
    };
  }
  if (mode === 'use-remote') {
    // 別アカウントのデータなら混ぜずに置き換える。同じアカウントなら端末にしかない項目は残す。
    const target = otherAccount
      ? remote.doc
      : mergePortalSyncDocs(weakenPortalSyncDoc(localDoc), remote.doc);
    return { target, reason: 'choice', replace: otherAccount };
  }

  if (otherAccount) {
    const replaced = countReplacedPortalSyncEntries(localDoc, remote.doc);
    if (replaced > 0) return { choice: { kind: 'other-account', replaced } };
    return { target: remote.doc, reason: 'sync', replace: true };
  }

  // 旧版からの移行直後: 手元の値は前回同期した時点の写しなので、ポータル側に置き換える。
  // 移行後に手元で行った変更（スタンプあり）だけは残して統合する。
  if (local.meta.adoptRemote) {
    const edits = Object.fromEntries(Object.entries(localDoc).filter(([, entry]) => entry.s.t > 0));
    return { target: mergePortalSyncDocs(remote.doc, edits), reason: 'sync', replace: true };
  }

  const target = mergePortalSyncDocs(localDoc, remote.doc);
  // この端末で初めて同期するときに、手元の内容が置き換わるなら確認する。
  if (local.meta.space === null) {
    const replaced = countReplacedPortalSyncEntries(localDoc, target);
    if (replaced > 0) return { choice: { kind: 'join', replaced } };
  }
  return { target, reason: 'sync', replace: false };
}

/** 統合結果を決めて端末へ反映し、ポータルへ書く必要があるかを返す。 */
async function planSync(
  io: PortalSyncIo,
  remote: PortalSyncRemoteRead,
  local: LocalPortalSyncState,
  mode: PortalSyncMode,
): Promise<SyncPlan | PortalSyncResult> {
  const localDoc = canonicalizePortalSyncDoc(local.doc);
  // 同期スペースは端末が覚えているものを使い続ける。作り直しても変えないので、
  // 他の端末が「別アカウント」と誤解して内容を置き換えることはない。
  const space = (remote.kind === 'ok' ? remote.space : null) ?? local.meta.space ?? io.newId();
  if (remote.kind !== 'ok') {
    const target = prunePortalSyncTombstones(localDoc);
    return {
      target,
      space,
      needsWrite: true,
      usedRows: 0,
      received: {},
      sent: countPortalSyncChanges({}, target),
    };
  }
  const decision = decideTarget(remote, local, localDoc, mode, () => io.newId());
  if ('choice' in decision) return { ok: false, issue: 'needs-choice', choice: decision.choice };

  const target = prunePortalSyncTombstones(decision.target);
  const received = await applyToLocal(io, target, {
    replace: decision.replace,
    reason: decision.reason,
  });
  const needsWrite =
    !portalSyncDocsEqual(target, remote.doc) || remote.untidy || remote.space !== space;
  const sent = countPortalSyncChanges(remote.doc, target);
  return { target, space, needsWrite, usedRows: remote.usedRows, received, sent };
}

/**
 * 新しい世代として保存し、読み直して確認する。
 * 他の端末の保存と重なって自分の世代が残らなかったら 'conflict'。
 */
async function writeGeneration(
  io: PortalSyncIo,
  links: readonly PortalUserLink[],
  plan: SyncPlan,
): Promise<PortalSyncResult | 'conflict'> {
  const rev = io.newId();
  const wire = await encodePortalSyncWire(plan.target, { rev, space: plan.space });
  const chunks = splitPortalSyncWire(wire);
  if (chunks.length > PORTAL_SETTINGS_MARKER_MAX) {
    return { ok: false, issue: 'over-capacity', usedRows: chunks.length };
  }
  try {
    await io.saveLinks(placePortalSyncMarkers(links, chunks, rev));
    const check = await readPortalSyncMarkers(await io.fetchLinks());
    if (check.kind !== 'ok' || !check.revs.includes(rev)) return 'conflict';
  } catch (error) {
    return portalSyncFailure(error);
  }
  return {
    ok: true,
    wrote: true,
    usedRows: chunks.length,
    received: plan.received,
    sent: plan.sent,
  };
}

async function syncLocked(io: PortalSyncIo, mode: PortalSyncMode): Promise<PortalSyncResult> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    let links: PortalUserLink[];
    try {
      links = await io.fetchLinks();
    } catch (error) {
      return portalSyncFailure(error);
    }
    const remote = await readPortalSyncMarkers(links);
    const local = await io.readLocal();
    const issue = blockingIssue(remote, local.meta, mode);
    if (issue) return { ok: false, issue };

    const plan = await planSync(io, remote, local, mode);
    if ('ok' in plan) return plan;
    const result = plan.needsWrite
      ? await writeGeneration(io, links, plan)
      : {
          ok: true as const,
          wrote: false,
          usedRows: plan.usedRows,
          received: plan.received,
          sent: {},
        };
    if (result === 'conflict') {
      // 他の端末の保存と重なった。端末側はもう統合済みなので、最新の内容と通常どおり統合し直す。
      mode = 'normal';
      continue;
    }
    if (result.ok) {
      await io.updateMeta({
        space: plan.space,
        adoptRemote: false,
        syncedClock: maxPortalSyncStampTime(plan.target),
      });
    }
    return result;
  }
  return { ok: false, issue: 'save-failed' };
}

export function runPortalSync(
  io: PortalSyncIo,
  mode: PortalSyncMode = 'normal',
): Promise<PortalSyncResult> {
  return io.withLock(async () => {
    try {
      return await syncLocked(io, mode);
    } catch (error) {
      return portalSyncFailure(error);
    }
  });
}

/**
 * ポータル上の同期データをすべて削除する（通常のマイリンクは残す）。
 * 同期スペースは覚えたままにし、オンにし直したとき同じスペースで再開する。
 */
export function deletePortalSyncRemote(
  io: PortalSyncIo,
): Promise<{ ok: true } | Extract<PortalSyncResult, { ok: false }>> {
  return io.withLock(async () => {
    try {
      const links = await io.fetchLinks();
      const next = retireAllPortalSyncMarkers(links);
      if (next.some((link, index) => link.delFlg !== links[index]?.delFlg)) {
        await io.saveLinks(next);
      }
      const check = await readPortalSyncMarkers(await io.fetchLinks());
      if (check.kind !== 'empty') {
        return {
          ok: false,
          issue: 'save-failed',
          detail: 'delete: sync rows are still on the portal',
        };
      }
    } catch (error) {
      return portalSyncFailure(error);
    }
    return { ok: true };
  });
}
