import { useCallback, useEffect, useState } from 'react';
import {
  isPortalSyncRunning,
  PORTAL_SYNC_STATUS_KEY,
  type PortalSyncEvent,
  type PortalSyncIssue,
} from '../../../../contract/portal-sync-status';
import { SK } from '../../../../contract/storage-keys';
import storage from '../../../../lib/storage';
import {
  canSyncPortalSettingsHere,
  countPendingPortalSyncChanges,
  getPortalMyLinksSyncEnabled,
  isPortalSyncLedgerKey,
  readPortalSyncStatus,
  resolvePortalSyncChoice,
  restartPortalSyncFromThisDevice,
  resumePortalSyncFromThisDevice,
  setPortalMyLinksSyncEnabled,
  syncPortalSettingsNow,
} from '../../../../services/portal-settings-sync';
import { useI18n } from '../../../../i18n';
import { SettingsSwitch } from './SettingsSwitch';
import { SettingsSyncMore } from './SettingsSyncMore';
import {
  describeEvent,
  describeSync,
  formatClock,
  type SyncCopy,
  type SyncTimeFormat,
  type SyncViewState,
} from './sync-status-view';

export type { SyncCopy };
export type RunTask = (task: () => Promise<unknown>) => void;

/** 「最近のできごと」に出す件数 */
const HISTORY_SHOWN = 6;

async function loadViewState(): Promise<SyncViewState> {
  const [enabled, status, pendingCount] = await Promise.all([
    getPortalMyLinksSyncEnabled(),
    readPortalSyncStatus(),
    countPendingPortalSyncChanges().catch(() => 0),
  ]);
  return { enabled, status, pendingCount };
}

function isSyncStateKey(key: string): boolean {
  return key === PORTAL_SYNC_STATUS_KEY || key === SK.syncViaMyLinks || isPortalSyncLedgerKey(key);
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

interface SyncAction {
  label: string;
  task: () => Promise<unknown>;
  /** 目立たせない操作 */
  quiet?: boolean;
}

/** 今の状態で押せる操作。押すと何が起きるかがボタン名だけで分かるようにする。 */
function actionsFor(issue: PortalSyncIssue | null, ui: SyncCopy): SyncAction[] {
  switch (issue) {
    case 'needs-choice':
      return [
        { label: ui.useRemote, task: () => resolvePortalSyncChoice('remote') },
        { label: ui.useLocal, task: () => resolvePortalSyncChoice('local') },
      ];
    case 'remote-missing':
      return [
        { label: ui.rebuild, task: resumePortalSyncFromThisDevice },
        { label: ui.turnOff, task: () => setPortalMyLinksSyncEnabled(false), quiet: true },
      ];
    case 'unreadable':
      return [{ label: ui.rebuild, task: restartPortalSyncFromThisDevice }];
    case 'too-new':
    case 'over-capacity':
      return [];
    default:
      return [{ label: ui.syncNow, task: () => syncPortalSettingsNow() }];
  }
}

function StatusCard({
  view,
  syncing,
  busy,
  here,
  time,
  ui,
  run,
}: {
  view: SyncViewState;
  syncing: boolean;
  busy: boolean;
  here: boolean;
  time: SyncTimeFormat;
  ui: SyncCopy;
  run: RunTask;
}) {
  const state = describeSync(view, syncing, here, time, ui);
  const showActions = view.enabled && here && !syncing;
  const actions = showActions ? actionsFor(view.status.issue, ui) : [];

  return (
    <div className={`p-sync-status p-sync-status--${state.tone}`} role="status" aria-live="polite">
      <span className="p-sync-status-dot" aria-hidden="true" />
      <div className="p-sync-status-body">
        <div className="p-sync-status-title">{state.head}</div>
        {state.lines.map((line) => (
          <p key={line} className="p-sync-status-detail">
            {line}
          </p>
        ))}
        {actions.length > 0 ? (
          <div className="p-sync-status-actions">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={action.quiet ? 'p-sync-link-btn' : 'p-settings-resync-btn'}
                disabled={busy}
                onClick={() => run(action.task)}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
        {state.tech ? (
          <details className="p-sync-tech">
            <summary>{ui.techDetails}</summary>
            <p className="p-sync-status-code">{state.tech}</p>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function SyncHistory({
  history,
  time,
  ui,
}: {
  history: PortalSyncEvent[];
  time: SyncTimeFormat;
  ui: SyncCopy;
}) {
  return (
    <div className="p-sync-history">
      <div className="p-sync-history-title">{ui.historyTitle}</div>
      {history.length === 0 ? (
        <p className="p-settings-hint">{ui.historyEmpty}</p>
      ) : (
        <ul className="p-sync-history-list">
          {history.slice(0, HISTORY_SHOWN).map((event) => (
            <li
              key={`${event.at}-${event.kind}`}
              className={`p-sync-history-item${event.kind === 'failed' ? ' is-failed' : ''}`}
            >
              <time className="p-sync-history-time" dateTime={new Date(event.at).toISOString()}>
                {formatClock(event.at, time)}
              </time>
              <span className="p-sync-history-text">
                {describeEvent(event, ui).map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SettingsMyLinksSyncSection() {
  const { t, locale } = useI18n();
  const ui = t.settings.myLinksSyncUi;
  const [view, setView] = useState<SyncViewState | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow(10_000);
  const here = canSyncPortalSettingsHere();

  const refresh = useCallback(() => {
    void loadViewState()
      .then(setView)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    return storage.onChanged((changes) => {
      if (Object.keys(changes).some(isSyncStateKey)) refresh();
    });
  }, [refresh]);

  const run: RunTask = (task) => {
    if (busy) return;
    setBusy(true);
    void task()
      .catch(() => undefined)
      .finally(() => {
        setBusy(false);
        refresh();
      });
  };

  const title = <div className="p-settings-section-title">{t.settings.myLinksSync}</div>;
  if (!view) {
    return <div className="p-settings-section p-settings-section--my-links-sync">{title}</div>;
  }

  const time = { locale, now };
  const syncing = busy || isPortalSyncRunning(view.status, now);
  return (
    <div className="p-settings-section p-settings-section--my-links-sync">
      {title}
      <SettingsSwitch
        checked={view.enabled}
        disabled={busy}
        label={ui.toggle}
        onChange={(next) => run(() => setPortalMyLinksSyncEnabled(next))}
      />
      <p className="p-settings-hint p-sync-toggle-hint">{ui.toggleHint}</p>
      <StatusCard
        view={view}
        syncing={syncing}
        busy={busy}
        here={here}
        time={time}
        ui={ui}
        run={run}
      />
      {view.enabled ? <SyncHistory history={view.status.history} time={time} ui={ui} /> : null}
      <SettingsSyncMore status={view.status} here={here} busy={busy} ui={ui} run={run} />
    </div>
  );
}
