/**
 * マイリンク同期の状態（設定画面の表示用）。`chrome.storage.local` で全ページに共有する。
 */

export const PORTAL_SYNC_STATUS_KEY = 'portalThemeSyncStatus' as const;

/**
 * 同期できない理由。
 * - signed-out: ポータルにログインしていない
 * - network: 通信できない（自動で再試行する）
 * - unreadable: ポータル上の同期データを読めない（上書きして作り直せる）
 * - too-new: 新しい版の拡張機能が保存したデータ（更新が必要）
 * - over-capacity: マイリンクに保存できる量を超えた
 * - remote-missing: ポータル上の同期データが削除された
 * - save-failed: ポータルへの保存が拒否された
 * - needs-choice: 同期するとこの端末の内容が置き換わるので、どちらに合わせるか確認したい
 * - unexpected: 上のどれにも当たらない失敗（拡張機能の不具合など）。detail に内容を残す
 */
export type PortalSyncIssue =
  | 'signed-out'
  | 'network'
  | 'unreadable'
  | 'too-new'
  | 'over-capacity'
  | 'remote-missing'
  | 'save-failed'
  | 'needs-choice'
  | 'unexpected';

/**
 * needs-choice の種類。
 * - join: この端末で初めて同期する（ポータルと内容が違う）
 * - other-account: 前に同期していたものと別の同期データ（別アカウントの可能性）
 */
export type PortalSyncChoiceKind = 'join' | 'other-account';

/**
 * 「最近の同期」に残す出来事。
 * - synced: 変更を受け取った・送った（何も変わらなかった同期は残さない）
 * - failed: 同期できなかった（同じ理由が続いたら1件にまとめる）
 * - used-remote / used-local: 内容が違ったとき、ポータル／この端末に合わせた
 * - rebuilt: この端末の内容で同期データを作り直した
 * - restored: バックアップから戻した
 * - deleted: ポータル上の同期データを削除した
 */
export type PortalSyncEventKind =
  | 'synced'
  | 'failed'
  | 'used-remote'
  | 'used-local'
  | 'rebuilt'
  | 'restored'
  | 'deleted';

export interface PortalSyncEvent {
  at: number;
  kind: PortalSyncEventKind;
  /** ほかの端末から受け取った変更（storage キー → 件数） */
  received?: Record<string, number>;
  /** この端末から送った変更（storage キー → 件数） */
  sent?: Record<string, number>;
  issue?: PortalSyncIssue;
  /** 同じ失敗が続いた回数 */
  repeat?: number;
}

/** 残す出来事の数 */
export const PORTAL_SYNC_HISTORY_LIMIT = 20;

export interface PortalSyncStatus {
  version: 1;
  /** 同期中なら開始時刻（タブが閉じた場合に備え、古いものは無視する） */
  syncingSince: number | null;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  issue: PortalSyncIssue | null;
  /** 使用中のマイリンク行数（容量表示用） */
  usedRows: number | null;
  /** needs-choice のとき: 種類と、ポータルに合わせると置き換わる件数 */
  choice: { kind: PortalSyncChoiceKind; replaced: number } | null;
  /** 失敗の具体的な内容（どの段階で、HTTP ステータス、メッセージ）。問い合わせ用 */
  detail: string | null;
  /** 自動でもう一度試す予定の時刻 */
  nextRetryAt: number | null;
  /** 最近の出来事（新しい順） */
  history: PortalSyncEvent[];
}

export const EMPTY_PORTAL_SYNC_STATUS: PortalSyncStatus = {
  version: 1,
  syncingSince: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  issue: null,
  usedRows: null,
  choice: null,
  detail: null,
  nextRetryAt: null,
  history: [],
};

/** これより長く「同期中」のままなら、中断されたものとみなす */
export const PORTAL_SYNC_STALE_MS = 60_000;

const ISSUES = new Set<PortalSyncIssue>([
  'signed-out',
  'network',
  'unreadable',
  'too-new',
  'over-capacity',
  'remote-missing',
  'save-failed',
  'needs-choice',
  'unexpected',
]);

function parseChoice(raw: unknown): PortalSyncStatus['choice'] {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as { kind?: unknown; replaced?: unknown };
  if (value.kind !== 'join' && value.kind !== 'other-account') return null;
  const replaced = typeof value.replaced === 'number' && value.replaced > 0 ? value.replaced : 0;
  return { kind: value.kind, replaced };
}

const EVENT_KINDS = new Set<PortalSyncEventKind>([
  'synced',
  'failed',
  'used-remote',
  'used-local',
  'rebuilt',
  'restored',
  'deleted',
]);

function parseCounts(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && value > 0) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseHistory(raw: unknown): PortalSyncEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: PortalSyncEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    if (typeof value.at !== 'number' || !EVENT_KINDS.has(value.kind as PortalSyncEventKind)) {
      continue;
    }
    out.push({
      at: value.at,
      kind: value.kind as PortalSyncEventKind,
      received: parseCounts(value.received),
      sent: parseCounts(value.sent),
      issue: ISSUES.has(value.issue as PortalSyncIssue)
        ? (value.issue as PortalSyncIssue)
        : undefined,
      repeat: typeof value.repeat === 'number' && value.repeat > 1 ? value.repeat : undefined,
    });
  }
  return out.slice(0, PORTAL_SYNC_HISTORY_LIMIT);
}

/** 出来事を先頭に足す。直前と同じ理由の失敗なら、回数を数えて1件にまとめる。 */
export function addPortalSyncEvent(
  history: readonly PortalSyncEvent[],
  event: PortalSyncEvent,
): PortalSyncEvent[] {
  const [latest, ...rest] = history;
  if (event.kind === 'failed' && latest?.kind === 'failed' && latest.issue === event.issue) {
    return [{ ...event, repeat: (latest.repeat ?? 1) + 1 }, ...rest];
  }
  return [event, ...history].slice(0, PORTAL_SYNC_HISTORY_LIMIT);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parsePortalSyncStatus(raw: unknown): PortalSyncStatus {
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1) {
    return { ...EMPTY_PORTAL_SYNC_STATUS };
  }
  const value = raw as Record<string, unknown>;
  return {
    version: 1,
    syncingSince: finiteOrNull(value.syncingSince),
    lastAttemptAt: finiteOrNull(value.lastAttemptAt),
    lastSuccessAt: finiteOrNull(value.lastSuccessAt),
    issue: ISSUES.has(value.issue as PortalSyncIssue) ? (value.issue as PortalSyncIssue) : null,
    usedRows: finiteOrNull(value.usedRows),
    choice: parseChoice(value.choice),
    detail: typeof value.detail === 'string' && value.detail ? value.detail.slice(0, 300) : null,
    nextRetryAt: finiteOrNull(value.nextRetryAt),
    history: parseHistory(value.history),
  };
}

export function isPortalSyncRunning(status: PortalSyncStatus, now = Date.now()): boolean {
  return status.syncingSince !== null && now - status.syncingSince < PORTAL_SYNC_STALE_MS;
}
