import type { Settings } from '../../../../context/settings';
import { UI_FONT_OPTIONS } from '../../../../domain/ui-font';
import { useI18n } from '../../../../i18n';

interface SettingsFontSectionProps {
  settings: Settings;
  onSettingChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void | Promise<void>;
}

export function SettingsFontSection({ settings, onSettingChange }: SettingsFontSectionProps) {
  const { t } = useI18n();

  return (
    <div className="p-settings-section p-settings-section--font">
      <div className="p-settings-section-title">{t.font.sectionTitle}</div>
      <label className="p-settings-row p-settings-row--select">
        <span>{t.font.selectLabel}</span>
        <select
          className="p-settings-select"
          value={settings.font}
          onChange={(event) => onSettingChange('font', event.target.value as Settings['font'])}
        >
          {UI_FONT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.id === 'default' ? t.font.default : option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="p-settings-hint">{t.font.hint}</p>
    </div>
  );
}
