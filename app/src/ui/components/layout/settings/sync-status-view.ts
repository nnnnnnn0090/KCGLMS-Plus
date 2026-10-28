/**
 * 同期の状態を、設定画面に出す文に変換する（表示ロジックのみ）。
 *
 * 画面は「今どうなっているか（見出し）」→「次にどうなるか・何をすればいいか（説明）」の
 * 順で、専門用語を使わずに伝える。
 */

import type {
  PortalSyncEvent,
  PortalSyncIssue,
  PortalSyncStatus,
} from '../../../../contract/portal-sync-status';
import { SK } from '../../../../contract/storage-keys';
import type { I18nMessages } from '../../../../i18n';

export type SyncCopy = I18nMessages['settings']['myLinksSyncUi'];
export type SyncTone = 'ok' | 'busy' | 'pending' | 'warn' | 'error' | 'off';

export interface SyncViewState {
  enabled: boolean;
  status: PortalSyncStatus;
  /** まだ送っていない変更の数 */
  pendingCount: number;
}

export interface SyncStatusView {
  tone: SyncTone;
  /** 今どうなっているか（一言） */
  head: string;
  /** 理由・次にどうなるか（短い文を順に） */
  lines: string[];
  /** 開発者向けの失敗内容 */
  tech: string | null;
}

export interface SyncTimeFormat {
  locale: string;
  now: number;
}

/** 「3 分前（15:02）」のような、相対時間と時刻 */
export function formatWhen(at: number, { locale, now }: SyncTimeFormat, ui: SyncCopy): string {
  const seconds = Math.round((at - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  let relative: string;
  if (Math.abs(seconds) < 10) relative = ui.justNow;
  else if (Math.abs(seconds) < 60) relative = rtf.format(seconds, 'second');
  else if (Math.abs(seconds) < 3600) relative = rtf.format(Math.round(seconds / 60), 'minute');
  else if (Math.abs(seconds) < 86400) relative = rtf.format(Math.round(seconds / 3600), 'hour');
  else relative = rtf.format(Math.round(seconds / 86400), 'day');
  if (Math.abs(seconds) < 60) return relative;
  const clock = formatClock(at, { locale, now });
  return /^(ja|zh)/.test(locale) ? `${relative}（${clock}）` : `${relative} (${clock})`;
}

/** 今日なら「15:02」、それ以外は「10/27 15:02」 */
export function formatClock(at: number, { locale, now }: SyncTimeFormat): string {
  const sameDay = new Date(at).toDateString() === new Date(now).toDateString();
  return new Intl.DateTimeFormat(locale, {
    ...(sameDay ? {} : { month: 'numeric', day: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

/** 失敗の理由（一言） */
function reasonFor(issue: PortalSyncIssue, ui: SyncCopy): string {
  switch (issue) {
    case 'network':
      return ui.reasonNetwork;
    case 'signed-out':
      return ui.reasonSignedOut;
    case 'save-failed':
      return ui.reasonSaveFailed;
    case 'unreadable':
      return ui.headUnreadable;
    case 'too-new':
      return ui.headTooNew;
    case 'over-capacity':
      return ui.headTooMuch;
    case 'remote-missing':
      return ui.headMissing;
    case 'needs-choice':
      return ui.headChoice;
    case 'unexpected':
      return ui.reasonUnexpected;
  }
}

function describeIssue(
  status: PortalSyncStatus,
  issue: PortalSyncIssue,
  time: SyncTimeFormat,
  ui: SyncCopy,
): SyncStatusView {
  const tech = status.detail;
  switch (issue) {
    case 'network':
    case 'save-failed':
    case 'unexpected': {
      const retry = status.nextRetryAt
        ? ui.nextRetry(formatWhen(status.nextRetryAt, time, ui))
        : null;
      return {
        tone: 'error',
        head: ui.headFailed,
        lines: [ui.reason(reasonFor(issue, ui)), ...(retry ? [retry] : []), ui.safe],
        tech,
      };
    }
    case 'signed-out':
      return {
        tone: 'warn',
        head: ui.headFailed,
        lines: [ui.reason(ui.reasonSignedOut), ui.nextSignedOut, ui.safe],
        tech,
      };
    case 'needs-choice':
      return {
        tone: 'warn',
        head: ui.headChoice,
        lines: [
          status.choice?.kind === 'other-account' ? ui.choiceOtherAccount : ui.choiceDiffer,
          ui.choiceSafe,
        ],
        tech: null,
      };
    case 'remote-missing':
      return { tone: 'warn', head: ui.headMissing, lines: [ui.missingLine], tech: null };
    case 'unreadable':
      return { tone: 'error', head: ui.headUnreadable, lines: [ui.unreadableLine], tech };
    case 'too-new':
      return { tone: 'warn', head: ui.headTooNew, lines: [ui.tooNewLine], tech: null };
    case 'over-capacity':
      return { tone: 'error', head: ui.headTooMuch, lines: [ui.tooMuchLine], tech: null };
  }
}

/** 今の状態を「見出し + 短い説明」に変換する */
export function describeSync(
  view: SyncViewState,
  syncing: boolean,
  here: boolean,
  time: SyncTimeFormat,
  ui: SyncCopy,
): SyncStatusView {
  if (!view.enabled) return { tone: 'off', head: ui.headOff, lines: [ui.lineOff], tech: null };
  if (syncing) return { tone: 'busy', head: ui.headSyncing, lines: [ui.lineWait], tech: null };
  const { status } = view;
  if (status.issue) return describeIssue(status, status.issue, time, ui);

  const checked = status.lastSuccessAt
    ? [ui.lineChecked(formatWhen(status.lastSuccessAt, time, ui))]
    : [];
  if (view.pendingCount > 0) {
    return {
      tone: 'pending',
      head: ui.headPending(view.pendingCount),
      lines: [here ? ui.linePendingHere : ui.linePendingElsewhere, ...checked],
      tech: null,
    };
  }
  if (status.lastSuccessAt) return { tone: 'ok', head: ui.headOk, lines: checked, tech: null };
  return {
    tone: 'pending',
    head: ui.headNever,
    lines: [here ? ui.lineNeverHere : ui.lineNeverElsewhere],
    tech: null,
  };
}

/** 変わった項目を「テーマ、予定 2 件」のような短い文にする */
export function summarizeChanges(counts: Record<string, number>, ui: SyncCopy): string {
  const parts: string[] = [];
  let display = false;
  for (const [key, count] of Object.entries(counts)) {
    switch (key) {
      case SK.theme:
        parts.push(ui.itemTheme);
        break;
      case SK.customThemes:
        parts.push(ui.itemCustomThemes(count));
        break;
      case SK.customCalEvents:
        parts.push(ui.itemEvents(count));
        break;
      case SK.shortcutConfig:
        parts.push(ui.itemShortcuts);
        break;
      case SK.language:
        parts.push(ui.itemLanguage);
        break;
      case SK.font:
        parts.push(ui.itemFont);
        break;
      default:
        display = true;
    }
  }
  if (display) parts.push(ui.itemDisplay);
  return parts.join(ui.listSeparator);
}

/** 「最近のできごと」の1件を文にする（受け取りと送信が両方あれば2行） */
export function describeEvent(event: PortalSyncEvent, ui: SyncCopy): string[] {
  switch (event.kind) {
    case 'synced': {
      const lines: string[] = [];
      if (event.received) lines.push(ui.historyReceived(summarizeChanges(event.received, ui)));
      if (event.sent) lines.push(ui.historySent(summarizeChanges(event.sent, ui)));
      return lines;
    }
    case 'failed': {
      const reason = event.issue ? reasonFor(event.issue, ui) : ui.reasonUnexpected;
      return [ui.historyFailed(reason) + (event.repeat ? ui.historyRepeat(event.repeat) : '')];
    }
    case 'used-remote':
      return [ui.historyUsedRemote];
    case 'used-local':
      return [ui.historyUsedLocal];
    case 'rebuilt':
      return [ui.historyRebuilt];
    case 'restored':
      return [ui.historyRestored];
    case 'deleted':
      return [ui.historyDeleted];
  }
}
