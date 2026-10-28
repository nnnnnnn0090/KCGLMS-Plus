import { useCallback, useEffect, useState } from 'react';
import { SK } from '../../../../contract/storage-keys';
import storage from '../../../../lib/storage';
import {
  listPortalSyncBackups,
  PORTAL_SYNC_BACKUP_LIMIT,
  PORTAL_SYNC_BACKUPS_KEY,
  restorePortalSyncBackup,
  type PortalSyncBackup,
} from '../../../../services/portal-settings-sync';
import type { RunTask, SyncCopy } from './SettingsMyLinksSyncSection';

function countItems(value: unknown, field: 'events' | 'themes'): number {
  if (!value || typeof value !== 'object') return 0;
  const items = (value as Record<string, unknown>)[field];
  return Array.isArray(items) ? items.length : 0;
}

function reasonLabel(backup: PortalSyncBackup, ui: SyncCopy): string {
  if (backup.reason === 'choice') return ui.backupReasonChoice;
  if (backup.reason === 'restore') return ui.backupReasonRestore;
  return ui.backupReasonSync;
}

/** 同期で内容が置き換わる前の自動バックアップの一覧と復元 */
export function SettingsSyncBackups({
  busy,
  ui,
  run,
  locale,
}: {
  busy: boolean;
  ui: SyncCopy;
  run: RunTask;
  locale: string;
}) {
  const [backups, setBackups] = useState<PortalSyncBackup[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listPortalSyncBackups()
      .then(setBackups)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    return storage.onChanged((changes) => {
      if (changes[PORTAL_SYNC_BACKUPS_KEY]) refresh();
    });
  }, [refresh]);

  const dateFormat = new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const restore = (id: string) =>
    run(async () => {
      const ok = await restorePortalSyncBackup(id);
      setConfirmingId(null);
      setNotice(ok ? ui.restored : ui.restoreFailed);
    });

  return (
    <div className="p-sync-backups">
      <div className="p-sync-backups-title">{ui.backupsTitle}</div>
      <p className="p-settings-hint">{ui.backupsHint(PORTAL_SYNC_BACKUP_LIMIT)}</p>
      {backups.length === 0 ? <p className="p-settings-hint">{ui.backupsEmpty}</p> : null}
      <ul className="p-sync-backup-list">
        {backups.map((backup) => (
          <li key={backup.id} className="p-sync-backup">
            <div className="p-sync-backup-text">
              <span className="p-sync-backup-when">
                {dateFormat.format(backup.at)} · {reasonLabel(backup, ui)}
              </span>
              <span className="p-sync-backup-summary">
                {ui.backupSummary(
                  countItems(backup.values[SK.customCalEvents], 'events'),
                  countItems(backup.values[SK.customThemes], 'themes'),
                )}
              </span>
            </div>
            {confirmingId === backup.id ? (
              <div className="p-sync-confirm" role="alertdialog" aria-label={ui.restore}>
                <p className="p-settings-hint">{ui.restoreConfirm}</p>
                <div className="p-sync-status-actions">
                  <button
                    type="button"
                    className="p-settings-resync-btn"
                    disabled={busy}
                    onClick={() => restore(backup.id)}
                  >
                    {ui.restoreConfirmAction}
                  </button>
                  <button
                    type="button"
                    className="p-sync-link-btn"
                    disabled={busy}
                    onClick={() => setConfirmingId(null)}
                  >
                    {ui.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="p-sync-link-btn"
                disabled={busy}
                onClick={() => {
                  setNotice(null);
                  setConfirmingId(backup.id);
                }}
              >
                {ui.restore}
              </button>
            )}
          </li>
        ))}
      </ul>
      {notice ? (
        <p className="p-settings-hint" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
