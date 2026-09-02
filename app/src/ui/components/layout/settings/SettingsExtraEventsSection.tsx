/**
 * 設定「連携」タブの追加予定セクション（件数・書き出し／読み込み）。
 * データ連携（King LMS）と同じ設定パネルのトーンに揃える。
 */

import { useRef, useState } from 'react';
import {
  CUSTOM_CAL_EVENTS_SCHEMA_VERSION,
  parseCustomCalEventCollectionWithReport,
  type CustomCalEvent,
} from '../../../../domain/custom-cal-events';
import { useCustomCalEvents } from '../../../../context/custom-cal-events';
import { useI18n } from '../../../../i18n';

const EXTRA_EVENTS_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

function downloadExtraEvents(events: readonly CustomCalEvent[]): void {
  const payload = {
    schemaVersion: CUSTOM_CAL_EVENTS_SCHEMA_VERSION,
    events,
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'portal-extra-events.json';
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function SettingsExtraEventsSection() {
  const { t } = useI18n();
  const { events, replaceEvents } = useCustomCalEvents();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > EXTRA_EVENTS_IMPORT_MAX_BYTES) {
        setStatus(t.settings.extraEventsImportError);
        return;
      }
      const text = await file.text();
      const raw: unknown = JSON.parse(text);
      if (
        !raw ||
        typeof raw !== 'object' ||
        (raw as { schemaVersion?: unknown }).schemaVersion !== CUSTOM_CAL_EVENTS_SCHEMA_VERSION ||
        !Array.isArray((raw as { events?: unknown }).events)
      ) {
        setStatus(t.settings.extraEventsImportError);
        return;
      }
      const result = parseCustomCalEventCollectionWithReport(raw);
      if (result.rejectedCount > 0 || result.truncated) {
        setStatus(t.settings.extraEventsImportError);
        return;
      }
      const parsed = result.collection;
      if (!window.confirm(t.settings.extraEventsImportConfirm(parsed.events.length))) {
        return;
      }
      replaceEvents(parsed);
      setStatus(t.settings.extraEventsImportOk(parsed.events.length));
    } catch {
      setStatus(t.settings.extraEventsImportError);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="p-settings-section p-settings-section--extra-events">
      <div className="p-settings-section-title">{t.settings.extraEvents}</div>
      <div className="p-settings-row p-settings-row-actions p-settings-extra-events">
        <div className="p-settings-extra-events-actions">
          <button
            type="button"
            className="p-settings-resync-btn"
            onClick={() => downloadExtraEvents(events)}
          >
            {t.settings.extraEventsExport}
          </button>
          <button
            type="button"
            className="p-settings-resync-btn"
            onClick={() => fileRef.current?.click()}
          >
            {t.settings.extraEventsImport}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void onImportFile(e.target.files?.[0])}
          />
        </div>
        <p className="p-settings-hint">
          {t.settings.extraEventsCount(events.length)}
          {' · '}
          {t.settings.extraEventsHint}
        </p>
        {status ? (
          <p className="p-settings-hint" role="status" aria-live="polite">
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
}
