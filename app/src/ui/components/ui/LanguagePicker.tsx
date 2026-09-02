/**
 * 初回チュートリアル前の言語選択画面。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_LANGUAGES, APP_LANGUAGE_LABELS, useI18n } from '../../../i18n';
import type { AppLanguage } from '../../../i18n/messages';

const LANG_PICKER_EXIT_MS = 360;

export interface LanguagePickerProps {
  initialLanguage: AppLanguage;
  onChange: (language: AppLanguage) => void;
  onConfirm: (language: AppLanguage) => void;
}

export function LanguagePicker({ initialLanguage, onChange, onConfirm }: LanguagePickerProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<AppLanguage>(initialLanguage);
  const [exiting, setExiting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const pick = useCallback(
    (id: AppLanguage) => {
      if (exiting) return;
      setSelected(id);
      onChange(id);
    },
    [exiting, onChange],
  );

  const handleConfirm = useCallback(() => {
    if (exiting) return;
    setExiting(true);
  }, [exiting]);

  useEffect(() => {
    if (!exiting) return;
    const el = rootRef.current;
    const finish = () => onConfirm(selected);
    if (!el) {
      finish();
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ms = reduced ? 30 : LANG_PICKER_EXIT_MS;
    const timer = window.setTimeout(finish, ms);
    const onAnimEnd = (e: AnimationEvent) => {
      if (e.animationName !== 'p-tour-dim-out') return;
      window.clearTimeout(timer);
      el.removeEventListener('animationend', onAnimEnd);
      finish();
    };
    el.addEventListener('animationend', onAnimEnd);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('animationend', onAnimEnd);
    };
  }, [exiting, onConfirm, selected]);

  return (
    <div
      ref={rootRef}
      className={`p-tour-root${exiting ? ' is-exiting' : ''}`}
      aria-hidden={exiting}
    >
      <div className="p-tour-dim-full" aria-hidden />
      <div
        className="p-tour-card p-tour-card--center p-lang-picker-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="p-lang-picker-title"
      >
        <div className="p-tour-card-inner">
          <h2 id="p-lang-picker-title">{t.languagePicker.title}</h2>
          <p>{t.languagePicker.subtitle}</p>
          <div className="p-lang-picker-grid" role="listbox" aria-label={t.language.selectLabel}>
            {APP_LANGUAGES.map((id) => (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={selected === id}
                disabled={exiting}
                className={`p-lang-picker-btn${selected === id ? ' is-selected' : ''}`}
                onClick={() => pick(id)}
              >
                {APP_LANGUAGE_LABELS[id]}
              </button>
            ))}
          </div>
          <div className="p-lang-picker-actions">
            <button
              type="button"
              className="p-lang-picker-continue"
              disabled={exiting}
              onClick={handleConfirm}
            >
              {t.languagePicker.continue}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
