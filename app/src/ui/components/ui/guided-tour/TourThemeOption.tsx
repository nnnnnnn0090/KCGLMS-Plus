import { useEffect, useRef } from 'react';
import type { ThemeTokens } from '../../../../domain/themes';
import {
  clearRuntimeElementCss,
  setRuntimeElementCss,
} from '../../../../lib/runtime-element-style';

export function TourThemeOption({
  themeKey,
  meta,
  name,
  active,
  onSelect,
}: {
  themeKey: string;
  meta: ThemeTokens;
  name: string;
  active: boolean;
  onSelect: (key: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setRuntimeElementCss(
      el,
      'theme-preview',
      `--p-tour-preview-bg:${meta.bg};--p-tour-preview-bg2:${meta.bgSecondary};` +
        `--p-tour-preview-text:${meta.textBright};--p-tour-preview-accent:${meta.accent};` +
        `--p-tour-preview-border:${meta.borderHover}`,
    );
    return () => clearRuntimeElementCss(el, 'theme-preview');
  }, [meta]);

  return (
    <button
      ref={ref}
      key={themeKey}
      type="button"
      className={`p-tour-theme-option${active ? ' is-active' : ''}`}
      aria-label={name}
      aria-pressed={active}
      onClick={() => onSelect(themeKey)}
    >
      <span className="p-tour-theme-option-preview" aria-hidden>
        <span className="p-tour-theme-option-window">
          <span />
          <span />
        </span>
        <span className="p-tour-theme-option-accent" />
      </span>
      <span className="p-tour-theme-option-name">{name}</span>
      {active ? (
        <span className="p-tour-theme-option-check" aria-hidden>
          ✓
        </span>
      ) : null}
    </button>
  );
}
