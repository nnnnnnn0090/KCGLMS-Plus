import { useState } from 'react';
import type { PortalSyncStatus } from '../../../../contract/portal-sync-status';
import { useI18n } from '../../../../i18n';
import {
  deletePortalSyncData,
  PORTAL_SETTINGS_MARKER_MAX,
} from '../../../../services/portal-settings-sync';
import type { RunTask, SyncCopy } from './SettingsMyLinksSyncSection';
import { SettingsSyncBackups } from './SettingsSyncBackups';

/** 学校のサーバー上に同期のデータがあるかもしれないか（ないと分かっているときは false） */
function mayHaveRemoteData(status: PortalSyncStatus): boolean {
  return status.usedRows !== 0 && status.issue !== 'remote-missing';
}

function UsageMeter({ usedRows, ui }: { usedRows: number; ui: SyncCopy }) {
  const label = ui.usage(usedRows, PORTAL_SETTINGS_MARKER_MAX);
  return (
    <div className="p-sync-usage">
      <div
        className="p-sync-usage-bar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={PORTAL_SETTINGS_MARKER_MAX}
        aria-valuenow={usedRows}
        aria-label={label}
      >
        <span
          style={{ width: `${Math.min(100, (usedRows / PORTAL_SETTINGS_MARKER_MAX) * 100)}%` }}
        />
      </div>
      <span className="p-sync-usage-label">{label}</span>
    </div>
  );
}

function DeleteRemoteData({ busy, ui, run }: { busy: boolean; ui: SyncCopy; run: RunTask }) {
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const confirmDelete = () =>
    run(async () => {
      const result = await deletePortalSyncData();
      setConfirming(false);
      setNotice(result.ok ? ui.deleteRemoteDone : ui.deleteRemoteFailed);
    });

  return (
    <>
      {confirming ? (
        <div className="p-sync-confirm" role="alertdialog" aria-label={ui.deleteRemote}>
          <p className="p-settings-hint">{ui.deleteRemoteConfirm}</p>
          <div className="p-sync-status-actions">
            <button
              type="button"
              className="p-sync-danger-btn"
              disabled={busy}
              onClick={confirmDelete}
            >
              {ui.deleteRemoteConfirmAction}
            </button>
            <button
              type="button"
              className="p-sync-link-btn"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              {ui.cancel}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="p-sync-link-btn p-sync-link-btn--danger"
          onClick={() => {
            setNotice(null);
            setConfirming(true);
          }}
        >
          {ui.deleteRemote}
        </button>
      )}
      {notice ? (
        <p className="p-settings-hint" role="status">
          {notice}
        </p>
      ) : null}
    </>
  );
}

/** ふだんは使わない設定（しくみの説明・使用量・元に戻す・削除）をまとめて畳んでおく */
export function SettingsSyncMore({
  status,
  here,
  busy,
  ui,
  run,
}: {
  status: PortalSyncStatus;
  here: boolean;
  busy: boolean;
  ui: SyncCopy;
  run: RunTask;
}) {
  const { locale } = useI18n();
  return (
    <details className="p-sync-details">
      <summary>{ui.moreTitle}</summary>
      <p className="p-settings-hint">{ui.howItWorks}</p>
      {status.usedRows ? <UsageMeter usedRows={status.usedRows} ui={ui} /> : null}
      <SettingsSyncBackups busy={busy} ui={ui} run={run} locale={locale} />
      {here && mayHaveRemoteData(status) ? (
        <DeleteRemoteData busy={busy} ui={ui} run={run} />
      ) : null}
    </details>
  );
}
