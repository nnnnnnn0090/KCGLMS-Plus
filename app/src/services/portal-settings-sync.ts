/**
 * 拡張機能の設定をポータル「マイリンク」経由で端末間同期する。
 *
 * - 端末側は値ごとに変更スタンプを持ち（portal-sync-ledger）、
 * - 同期はエントリごとに新しい方を採用して統合する（portal-sync-engine）。
 * - マイリンクへの書き込みは全タブで直列化し、保存後に読み直して確認する。
 *
 * このモジュールは、いつ同期するか（起動時・変更時・タブ復帰時・定期）と、
 * 設定画面に見せる状態を管理する。
 */

import { PORTAL_HOSTNAME } from '../contract/origins';
import {
  addPortalSyncEvent,
  isPortalSyncRunning,
  parsePortalSyncStatus,
  PORTAL_SYNC_STATUS_KEY,
  type PortalSyncEvent,
  type PortalSyncEventKind,
  type PortalSyncIssue,
  type PortalSyncStatus,
} from '../contract/portal-sync-status';
import { SK } from '../contract/storage-keys';
import { chromeStorageClient } from '../platform/storage/chrome-storage-client';
import { parseSyncViaMyLinks } from '../platform/storage/parsers';
import {
  backupLocalPortalSyncState,
  commitLocalPortalSyncDoc,
  countPendingPortalSyncChanges,
  restorePortalSyncBackup as restoreLedgerBackup,
  createPortalSyncId,
  ensurePortalSyncLedger,
  hasPendingPortalSyncChanges,
  isPortalSyncLedgerKey,
  readLocalPortalSyncState,
  updatePortalSyncLedgerMeta,
} from '../platform/storage/portal-sync-ledger';
import {
  deletePortalSyncRemote,
  portalSyncFailure,
  runPortalSync,
  type PortalSyncIo,
  type PortalSyncMode,
} from './portal-sync-engine';
import { isPortalSettingsMarkerLink } from './portal-sync-markers';
import {
  fetchPortalUserLinks,
  savePortalUserLinks,
  withPortalUserLinksLock,
} from './user-html-link';
import {
  customThemesFromPortalStorage,
  settingsFromPortalStorage,
} from './portal-settings-payload';

export {
  isPortalSettingsMarkerLink,
  PORTAL_SETTINGS_MARKER_MAX,
  PORTAL_SETTINGS_MARKER_PREFIX,
} from './portal-sync-markers';
export {
  PORTAL_SYNCED_STORAGE_KEYS,
  isPortalSyncedStorageKey,
} from '../contract/portal-synced-storage';
export { countPendingPortalSyncChanges, hasPendingPortalSyncChanges, isPortalSyncLedgerKey };
export {
  listPortalSyncBackups,
  PORTAL_SYNC_BACKUP_LIMIT,
  PORTAL_SYNC_BACKUPS_KEY,
  type PortalSyncBackup,
} from '../platform/storage/portal-sync-ledger';

/** ローカルの変更から同期を始めるまでの待ち時間（連続した変更をまとめる） */
const LOCAL_CHANGE_DELAY_MS = 1500;
/** 起動時、同期を待ってから画面を出す最大時間 */
const BOOTSTRAP_WAIT_MS = 5000;
/** ポータルのタブを開いている間の定期同期 */
const PERIODIC_SYNC_MS = 5 * 60_000;
/** タブに戻ったとき、前回からこれ以上経っていれば同期する */
const REFOCUS_SYNC_MIN_MS = 30_000;
/** 保存後、他の端末と同時に保存していないか確かめ直すまでの時間 */
const FOLLOW_UP_SYNC_MS = 15_000;
/** 通信エラー時の再試行間隔 */
const RETRY_DELAYS_MS = [5_000, 30_000, 2 * 60_000, 5 * 60_000];
/** 一時的な通信失敗は、この回数続くまで画面にエラーとして出さない */
const QUIET_NETWORK_FAILURES = 2;

const portalSyncIo: PortalSyncIo = {
  fetchLinks: fetchPortalUserLinks,
  saveLinks: savePortalUserLinks,
  withLock: withPortalUserLinksLock,
  readLocal: readLocalPortalSyncState,
  commitLocal: commitLocalPortalSyncDoc,
  backupLocal: backupLocalPortalSyncState,
  updateMeta: updatePortalSyncLedgerMeta,
  newId: () => createPortalSyncId(8),
};

let bootstrapPromise: Promise<void> | null = null;
let listenersInstalled = false;
let running: Promise<PortalSyncStatus> | null = null;
let rerunRequested = false;
let localChangeTimer: ReturnType<typeof setTimeout> | null = null;
let followUpTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;

function isOnPortalHost(): boolean {
  return typeof location !== 'undefined' && location.hostname === PORTAL_HOSTNAME;
}

/** この端末で同期が有効か（未設定は有効） */
export async function getPortalMyLinksSyncEnabled(): Promise<boolean> {
  const snap = await chromeStorageClient.get(SK.syncViaMyLinks);
  return parseSyncViaMyLinks(snap[SK.syncViaMyLinks]);
}

export async function readPortalSyncStatus(): Promise<PortalSyncStatus> {
  const snap = await chromeStorageClient.get(PORTAL_SYNC_STATUS_KEY);
  return parsePortalSyncStatus(snap[PORTAL_SYNC_STATUS_KEY]);
}

async function patchStatus(
  patch: Partial<Omit<PortalSyncStatus, 'version'>>,
  event?: PortalSyncEvent,
) {
  const current = await readPortalSyncStatus();
  const history = event ? addPortalSyncEvent(current.history, event) : current.history;
  const next: PortalSyncStatus = { ...current, ...patch, history, version: 1 };
  await chromeStorageClient.set({ [PORTAL_SYNC_STATUS_KEY]: next });
  return next;
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
  if (timer) clearTimeout(timer);
  return null;
}

/** 自動で再試行する理由なら、再試行の時刻を返す */
function scheduleRetry(issue: PortalSyncIssue): number | null {
  retryTimer = clearTimer(retryTimer);
  if (issue !== 'network' && issue !== 'save-failed' && issue !== 'unexpected') {
    retryCount = 0;
    return null;
  }
  const delay = RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)];
  retryCount += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncPortalSettingsNow();
  }, delay);
  return Date.now() + delay;
}

const EVENT_FOR_MODE: Partial<Record<PortalSyncMode, PortalSyncEventKind>> = {
  'use-remote': 'used-remote',
  'use-local': 'used-local',
  restart: 'rebuilt',
};

function hasChanges(counts: Record<string, number>): boolean {
  return Object.keys(counts).length > 0;
}

async function runOnce(mode: PortalSyncMode): Promise<PortalSyncStatus> {
  const startedAt = Date.now();
  await patchStatus({ syncingSince: startedAt, lastAttemptAt: startedAt });
  let result;
  try {
    result = await runPortalSync(portalSyncIo, mode);
  } catch (error) {
    result = portalSyncFailure(error);
  }

  if (result.ok) {
    retryCount = 0;
    retryTimer = clearTimer(retryTimer);
    if (result.wrote) {
      followUpTimer = clearTimer(followUpTimer);
      followUpTimer = setTimeout(() => {
        followUpTimer = null;
        void syncPortalSettingsNow();
      }, FOLLOW_UP_SYNC_MS);
    }
    const kind = EVENT_FOR_MODE[mode];
    const changed = hasChanges(result.received) || hasChanges(result.sent);
    const now = Date.now();
    return patchStatus(
      {
        syncingSince: null,
        lastSuccessAt: now,
        issue: null,
        usedRows: result.usedRows,
        choice: null,
        detail: null,
        nextRetryAt: null,
      },
      kind || changed
        ? { at: now, kind: kind ?? 'synced', received: result.received, sent: result.sent }
        : undefined,
    );
  }

  // 開発者ツールのコンソールから原因を追えるようにする。
  console.warn('[KCGLMS+] My Links sync failed:', result.issue, result.detail ?? '');
  const failuresBefore = retryCount;
  const nextRetryAt = scheduleRetry(result.issue);
  // ページを開いた直後などの一時的な失敗では、エラー表示を出さずに再試行する。
  if (result.issue === 'network' && failuresBefore < QUIET_NETWORK_FAILURES) {
    return patchStatus({ syncingSince: null, nextRetryAt });
  }
  // 確認待ち（どちらに合わせるか等）は失敗ではないので、履歴には残さない。
  const event: PortalSyncEvent | undefined =
    result.issue === 'needs-choice'
      ? undefined
      : { at: Date.now(), kind: 'failed', issue: result.issue };
  return patchStatus(
    {
      syncingSince: null,
      issue: result.issue,
      choice: result.choice ?? null,
      detail: result.detail ?? null,
      nextRetryAt,
      ...(result.usedRows !== undefined ? { usedRows: result.usedRows } : {}),
    },
    event,
  );
}

/**
 * 今すぐ同期する。ポータル上でのみ動き、同じページ内で重なった呼び出しは1回にまとめる。
 * mode の意味は PortalSyncMode を参照。
 */
export async function syncPortalSettingsNow(
  mode: PortalSyncMode = 'normal',
): Promise<PortalSyncStatus> {
  if (!isOnPortalHost()) return readPortalSyncStatus();
  if (mode === 'normal' && !(await getPortalMyLinksSyncEnabled())) return readPortalSyncStatus();
  await ensurePortalSyncLedger();

  if (running) {
    if (mode === 'normal') {
      rerunRequested = true;
      return running;
    }
    await running.catch(() => undefined);
  }

  const task = (async () => {
    let status = await runOnce(mode);
    while (rerunRequested) {
      rerunRequested = false;
      status = await runOnce('normal');
    }
    return status;
  })();
  running = task;
  try {
    return await task;
  } finally {
    if (running === task) running = null;
  }
}

/** 実行中の同期があれば終わるまで待つ（結果は問わない） */
export async function waitForPortalSyncIdle(): Promise<void> {
  await running?.catch(() => undefined);
}

function scheduleLocalChangeSync(): void {
  localChangeTimer = clearTimer(localChangeTimer);
  localChangeTimer = setTimeout(() => {
    localChangeTimer = null;
    void (async () => {
      if (!(await getPortalMyLinksSyncEnabled())) return;
      if (await hasPendingPortalSyncChanges()) await syncPortalSettingsNow();
    })();
  }, LOCAL_CHANGE_DELAY_MS);
}

function installPortalSyncTriggers(): void {
  if (listenersInstalled || !isOnPortalHost()) return;
  listenersInstalled = true;

  chromeStorageClient.onChanged((changes, area) => {
    if (area !== 'local') return;
    if (changes[SK.syncViaMyLinks]) {
      if (parseSyncViaMyLinks(changes[SK.syncViaMyLinks].newValue)) void syncPortalSettingsNow();
      return;
    }
    if (Object.keys(changes).some(isPortalSyncLedgerKey)) scheduleLocalChangeSync();
  });

  const syncIfStale = () => {
    if (document.visibilityState !== 'visible') return;
    void readPortalSyncStatus().then((status) => {
      const last = status.lastAttemptAt ?? 0;
      if (Date.now() - last >= REFOCUS_SYNC_MIN_MS) void syncPortalSettingsNow();
    });
  };
  document.addEventListener('visibilitychange', syncIfStale);
  window.addEventListener('online', () => void syncPortalSettingsNow());
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncPortalSettingsNow();
  }, PERIODIC_SYNC_MS);
}

async function runPortalExtensionBootstrap(): Promise<void> {
  await ensurePortalSyncLedger();
  if (!isOnPortalHost()) return;
  installPortalSyncTriggers();
  // 前回の同期が途中で閉じられていたら「同期中」を解除する。
  const status = await readPortalSyncStatus();
  if (status.syncingSince !== null && !isPortalSyncRunning(status)) {
    await patchStatus({ syncingSince: null });
  }
  if (!(await getPortalMyLinksSyncEnabled())) return;
  // 他の端末の変更を反映してから画面を出す。遅いときは待たずに表示し、後から反映する。
  await Promise.race([
    syncPortalSettingsNow(),
    new Promise<void>((resolve) => setTimeout(resolve, BOOTSTRAP_WAIT_MS)),
  ]);
}

/** 起動時に1回だけ: 台帳の準備 → ポータル上なら同期 */
export function ensurePortalExtensionBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = runPortalExtensionBootstrap().catch(() => undefined);
  }
  return bootstrapPromise;
}

/**
 * この端末での同期の有効/無効を切り替える。
 * ポータル上の同期データには触れない（削除は deletePortalSyncData）。
 */
export async function setPortalMyLinksSyncEnabled(enabled: boolean): Promise<void> {
  await chromeStorageClient.set({ [SK.syncViaMyLinks]: enabled });
  if (!enabled) {
    retryTimer = clearTimer(retryTimer);
    await patchStatus({ issue: null, syncingSince: null, choice: null });
    return;
  }
  // 自分でオンにしたので、ポータル側が空ならこの端末の内容で始め直してよい。
  await syncPortalSettingsNow('resume');
}

/**
 * マイリンクにほかの端末の同期データ（既存の設定）があるか。読むだけで書き換えない。
 * 読めなかったときは「ない」として扱う（初回チュートリアルの最後で聞く）。
 */
export async function detectPortalSyncData(): Promise<boolean> {
  if (!isOnPortalHost()) return false;
  try {
    const links = await fetchPortalUserLinks();
    return links.some((link) => !link.delFlg && isPortalSettingsMarkerLink(link));
  } catch {
    return false;
  }
}

/**
 * 既存の設定（ポータル上の同期データ）にこの端末を合わせて同期を始める。
 * 「どちらに合わせるか」をもう一度聞かず、ポータル側を優先して統合する。
 */
export async function alignWithPortalSyncData(): Promise<PortalSyncStatus> {
  await chromeStorageClient.set({ [SK.syncViaMyLinks]: true });
  return syncPortalSettingsNow('use-remote');
}

/** ポータル上の同期データがないときに、この端末の内容で同期を再開する。 */
export async function resumePortalSyncFromThisDevice(): Promise<PortalSyncStatus> {
  await chromeStorageClient.set({ [SK.syncViaMyLinks]: true });
  return syncPortalSettingsNow('resume');
}

/** ポータル上の同期データが読めないときに、この端末の内容で作り直す。 */
export async function restartPortalSyncFromThisDevice(): Promise<PortalSyncStatus> {
  await chromeStorageClient.set({ [SK.syncViaMyLinks]: true });
  return syncPortalSettingsNow('restart');
}

/**
 * この端末とポータルの内容が違うとき、どちらに合わせるかを決めて同期する。
 * どちらを選んでも、書き換える前の端末の内容はバックアップに残る。
 */
export function resolvePortalSyncChoice(use: 'remote' | 'local'): Promise<PortalSyncStatus> {
  return syncPortalSettingsNow(use === 'remote' ? 'use-remote' : 'use-local');
}

/**
 * ポータル上の同期データを削除し、この端末の同期をオフにする。
 * この端末の設定はそのまま残る。
 */
export async function deletePortalSyncData(): Promise<{
  ok: boolean;
  issue?: PortalSyncIssue;
  detail?: string;
}> {
  if (!isOnPortalHost()) return { ok: false, issue: 'network' };
  retryTimer = clearTimer(retryTimer);
  const result = await deletePortalSyncRemote(portalSyncIo);
  if (result.ok) {
    // 削除できたときだけ同期を止める（失敗したら今の状態のまま）。
    await chromeStorageClient.set({ [SK.syncViaMyLinks]: false });
    await patchStatus(
      { issue: null, syncingSince: null, usedRows: 0, choice: null, nextRetryAt: null },
      { at: Date.now(), kind: 'deleted' },
    );
    return { ok: true };
  }
  await patchStatus({ syncingSince: null });
  console.warn('[KCGLMS+] My Links sync delete failed:', result.issue, result.detail ?? '');
  return { ok: false, issue: result.issue, detail: result.detail };
}

export function canSyncPortalSettingsHere(): boolean {
  return isOnPortalHost();
}

export {
  customThemesFromPortalStorage as parseCustomThemesFromExtensionStorage,
  settingsFromPortalStorage as parseSettingsFromExtensionStorage,
};

/** バックアップの内容に戻し、「最近の同期」に記録する。 */
export async function restorePortalSyncBackup(id: string): Promise<boolean> {
  const ok = await restoreLedgerBackup(id);
  if (ok) await patchStatus({}, { at: Date.now(), kind: 'restored' });
  return ok;
}
