/**
 * 初回チュートリアルの「フォントを選ぶ」手順。
 * それぞれの候補を、そのフォント自体で見本表示する。選ぶとすぐ画面全体に反映する。
 */

import { useEffect, type ReactNode, type RefObject } from 'react';
import type { I18nMessages } from '../../../../i18n/messages';
import {
  DEFAULT_UI_FONT,
  loadUiFontPreviews,
  UI_FONT_OPTIONS,
  UI_FONT_STACK,
  type UiFont,
} from '../../../../domain/ui-font';

/** おすすめ（既定）のフォントを先頭に並べる */
const ORDERED_OPTIONS = [
  ...UI_FONT_OPTIONS.filter((option) => option.id === DEFAULT_UI_FONT),
  ...UI_FONT_OPTIONS.filter((option) => option.id !== DEFAULT_UI_FONT),
];

/** 英数字の見え方の見本（どの言語でも同じ） */
const LATIN_SAMPLE = 'Aa Bb 123';

interface TourFontStepProps {
  stepId: string;
  t: I18nMessages;
  font: UiFont;
  onSelect: (font: UiFont) => void;
  cardRef: RefObject<HTMLDivElement | null>;
  dockExiting: boolean;
  previewGuard: ReactNode;
  progress: ReactNode;
  actions: ReactNode;
}

export function TourFontStep({
  stepId,
  t,
  font,
  onSelect,
  cardRef,
  dockExiting,
  previewGuard,
  progress,
  actions,
}: TourFontStepProps) {
  // 見比べられるよう、この手順の間だけ候補のフォントをまとめて読み込む。
  useEffect(() => loadUiFontPreviews(), []);

  return (
    <div className="p-tour-root p-tour-root--theme">
      {previewGuard}
      <div
        key={stepId}
        ref={cardRef}
        className={`p-tour-theme-dock p-tour-week-start-dock p-tour-font-dock${dockExiting ? ' is-exiting' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="p-tour-font-title"
        aria-describedby="p-tour-font-body"
      >
        <div className="p-tour-theme-dock-inner">
          <div className="p-tour-theme-copy">
            <div>
              <span className="p-tour-eyebrow">{t.guidedTour.themeEyebrow}</span>
              <h2 id="p-tour-font-title">{t.guidedTour.fontTitle}</h2>
              <p id="p-tour-font-body">{t.guidedTour.fontBody}</p>
            </div>
            {progress}
          </div>

          <div className="p-tour-font-options" role="radiogroup" aria-label={t.font.selectLabel}>
            {ORDERED_OPTIONS.map((option) => {
              const active = option.id === font;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`p-tour-font-option${active ? ' is-active' : ''}`}
                  onClick={() => onSelect(option.id)}
                >
                  <span
                    className="p-tour-font-sample"
                    style={{ fontFamily: UI_FONT_STACK[option.id] }}
                  >
                    <span className="p-tour-font-sample-main">{t.guidedTour.fontSample}</span>
                    <span className="p-tour-font-sample-sub" aria-hidden>
                      {LATIN_SAMPLE}
                    </span>
                  </span>
                  <span className="p-tour-font-name">
                    <span>{option.id === 'default' ? t.font.default : option.label}</span>
                    {option.id === DEFAULT_UI_FONT ? (
                      <span className="p-tour-font-badge">{t.guidedTour.fontRecommended}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="p-tour-theme-footer p-tour-week-start-footer">
            <p>{t.guidedTour.fontHint}</p>
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}
