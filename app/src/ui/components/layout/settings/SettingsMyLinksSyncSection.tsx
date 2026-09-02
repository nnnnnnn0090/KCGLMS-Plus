import { useEffect, useState } from 'react';
import { SK } from '../../../../contract/storage-keys';
import storage from '../../../../lib/storage';
import {
  getPortalMyLinksSyncEnabled,
  setPortalMyLinksSyncEnabled,
} from '../../../../services/portal-settings-sync';
import { useI18n } from '../../../../i18n';
import { SettingsSwitch } from './SettingsSwitch';

export function SettingsMyLinksSyncSection() {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPortalMyLinksSyncEnabled()
      .then((value) => {
        if (!cancelled) setEnabled(value);
      })
      .catch(() => {
        if (!cancelled) setEnabled(true);
      });
    const unsubscribe = storage.onChanged((changes, area) => {
      if (area !== 'local' || !changes[SK.syncViaMyLinks]) return;
      setEnabled(changes[SK.syncViaMyLinks].newValue !== false);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const updateEnabled = async (next: boolean) => {
    if (saving || enabled === null) return;
    const previous = enabled;
    setEnabled(next);
    setSaving(true);
    try {
      await setPortalMyLinksSyncEnabled(next);
      setEnabled(await getPortalMyLinksSyncEnabled());
    } catch {
      setEnabled(previous);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-settings-section p-settings-section--my-links-sync">
      <div className="p-settings-section-title">{t.settings.myLinksSync}</div>
      <SettingsSwitch
        checked={enabled ?? true}
        disabled={enabled === null || saving}
        label={t.settings.myLinksSyncToggle}
        onChange={(next) => void updateEnabled(next)}
      />
      <p className="p-settings-hint">
        {enabled === false ? t.settings.myLinksSyncHintOff : t.settings.myLinksSyncHintOn}
      </p>
    </div>
  );
}
