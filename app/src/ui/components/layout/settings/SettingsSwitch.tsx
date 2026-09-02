interface SettingsSwitchProps {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SettingsSwitch({
  checked,
  label,
  onChange,
  disabled = false,
}: SettingsSwitchProps) {
  return (
    <label className={`p-settings-switch-row${disabled ? ' is-disabled' : ''}`}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="p-settings-switch-track" aria-hidden="true" />
    </label>
  );
}
