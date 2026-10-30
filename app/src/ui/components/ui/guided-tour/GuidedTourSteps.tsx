import type { RefObject } from 'react';
import { themeDisplayName } from '../../../../i18n';
import type { AppLanguage, I18nMessages } from '../../../../i18n/messages';
import type { Settings } from '../../../../context/settings';
import { THEMES, type ThemeTokens } from '../../../../domain/themes';
import homeCornerCharacterUrl from '../../../../assets/914_20260621035718-display.webp';
import {
  EXISTING_SYNC_STEP_ID,
  PROGRESS_WIDTH_CLASS,
  RECOMMENDED_THEME_KEYS,
  mascotIllustratorName,
  mascotIllustratorUrl,
} from './constants';
import { TourFontStep } from './TourFontStep';
import { TourSyncStep } from './TourSyncStep';
import { TourWelcome } from './TourWelcome';
import { TourThemeOption } from './TourThemeOption';
import type { TourStep } from './types';

export interface GuidedTourStepsProps {
  currentStep: TourStep;
  steps: TourStep[];
  stepIndex: number;
  cardRef: RefObject<HTMLDivElement | null>;
  dockExiting: boolean;
  celebrating: boolean;
  finishingFade: boolean;
  overlayRoot: HTMLElement;
  settings: Settings;
  language: AppLanguage;
  t: I18nMessages;
  updateTheme: (key: string) => void;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  goBack: () => void;
  goNext: () => void;
  finishTour: () => void;
  celebrateAndFinishTour: () => void;
}

export function GuidedTourSteps({
  currentStep,
  steps,
  stepIndex,
  cardRef,
  dockExiting,
  celebrating,
  finishingFade,
  overlayRoot,
  settings,
  language,
  t,
  updateTheme,
  updateSetting,
  goBack,
  goNext,
  finishTour,
  celebrateAndFinishTour,
}: GuidedTourStepsProps) {
  const findCopy = (id: string) =>
    t.guidedTour.steps.find((item: { id: string }) => item.id === id);
  const copy = findCopy(currentStep.id);
  const isLast = currentStep.kind === 'done';

  const renderProgress = () => (
    <div className="p-tour-progress" aria-hidden>
      <span className="p-tour-progress-count">
        {stepIndex + 1}
        <span>/</span>
        {steps.length}
      </span>
      <span className="p-tour-progress-track">
        <span className={PROGRESS_WIDTH_CLASS[`${stepIndex + 1}/${steps.length}`] ?? 'tw-w-full'} />
      </span>
    </div>
  );

  const renderActions = () => (
    <div className="p-tour-card-actions">
      <div className="p-tour-card-actions-secondary">
        {stepIndex > 0 ? (
          <button type="button" className="p-tour-back" onClick={goBack}>
            {t.guidedTour.back}
          </button>
        ) : null}
        {!isLast ? (
          <button type="button" className="p-tour-skip" onClick={finishTour}>
            {t.guidedTour.skip}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="p-tour-primary"
        disabled={celebrating}
        aria-busy={celebrating}
        aria-label={isLast ? t.guidedTour.primaryDone : undefined}
        onClick={isLast ? celebrateAndFinishTour : goNext}
      >
        {celebrating ? (
          <span className="p-tour-finish-spinner" aria-hidden />
        ) : isLast ? (
          t.guidedTour.primaryDone
        ) : (
          t.common.next
        )}
      </button>
    </div>
  );

  const renderPreviewScrollGuard = () => (
    <div
      className="p-tour-theme-guard"
      aria-hidden
      onWheel={(event) => {
        event.preventDefault();
        overlayRoot.scrollBy({ top: event.deltaY, left: 0, behavior: 'auto' });
      }}
    />
  );

  if (currentStep.kind === 'theme') {
    const allThemes = Object.entries(THEMES);
    const recommended = RECOMMENDED_THEME_KEYS.flatMap((key) =>
      THEMES[key] ? [[key, THEMES[key]] as const] : [],
    );
    const recommendedKeys = new Set<string>(RECOMMENDED_THEME_KEYS);
    const otherThemes = allThemes.filter(([key]) => !recommendedKeys.has(key));
    const renderThemeOptions = (themes: readonly (readonly [string, ThemeTokens])[]) =>
      themes.map(([key, meta]) => {
        const name = themeDisplayName(key, meta.name, language);
        const active = settings.theme === key;
        return (
          <TourThemeOption
            key={key}
            themeKey={key}
            meta={meta}
            name={name}
            active={active}
            onSelect={updateTheme}
          />
        );
      });

    return (
      <div className="p-tour-root p-tour-root--theme">
        {renderPreviewScrollGuard()}
        <div
          key={currentStep.id}
          ref={cardRef}
          className={`p-tour-theme-dock p-tour-theme-selection-dock${dockExiting ? ' is-exiting' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="p-tour-theme-title"
          aria-describedby="p-tour-theme-body"
        >
          <div className="p-tour-theme-dock-inner">
            <div className="p-tour-theme-copy">
              <div>
                <span className="p-tour-eyebrow">{t.guidedTour.themeEyebrow}</span>
                <h2 id="p-tour-theme-title">{t.guidedTour.themeTitle}</h2>
                <p id="p-tour-theme-body">{t.guidedTour.themeBody}</p>
              </div>
              {renderProgress()}
            </div>

            <div className="p-tour-theme-lists">
              <section>
                <div className="p-tour-theme-picker-head">
                  <span>{t.guidedTour.themeRecommended}</span>
                </div>
                <div className="p-tour-theme-grid p-tour-theme-grid--recommended">
                  {renderThemeOptions(recommended)}
                </div>
              </section>
              <section>
                <div className="p-tour-theme-picker-head">
                  <span>{t.guidedTour.themeOther}</span>
                </div>
                <div className="p-tour-theme-grid">{renderThemeOptions(otherThemes)}</div>
              </section>
            </div>

            <div className="p-tour-theme-footer">
              <p>
                {t.guidedTour.themeHint}{' '}
                {language === 'ja'
                  ? '設定では、独自テーマも作成できます。'
                  : 'You can also create a custom theme later in Settings.'}
              </p>
              {renderActions()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep.kind === 'welcome') {
    return <TourWelcome t={t} cardRef={cardRef} onStart={goNext} onLater={finishTour} />;
  }

  if (currentStep.kind === 'font') {
    return (
      <TourFontStep
        stepId={currentStep.id}
        t={t}
        font={settings.font}
        onSelect={(font) => updateSetting('font', font)}
        cardRef={cardRef}
        dockExiting={dockExiting}
        previewGuard={renderPreviewScrollGuard()}
        progress={renderProgress()}
        actions={renderActions()}
      />
    );
  }

  if (currentStep.kind === 'sync') {
    return (
      <TourSyncStep
        stepId={currentStep.id}
        existing={currentStep.id === EXISTING_SYNC_STEP_ID}
        t={t}
        cardRef={cardRef}
        dockExiting={dockExiting}
        previewGuard={renderPreviewScrollGuard()}
        progress={renderProgress()}
        actions={renderActions()}
      />
    );
  }

  if (currentStep.kind === 'weekStart') {
    return (
      <div className="p-tour-root p-tour-root--theme">
        {renderPreviewScrollGuard()}
        <div
          key={currentStep.id}
          ref={cardRef}
          className={`p-tour-theme-dock p-tour-week-start-dock${dockExiting ? ' is-exiting' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="p-tour-week-start-title"
          aria-describedby="p-tour-week-start-body"
        >
          <div className="p-tour-theme-dock-inner">
            <div className="p-tour-theme-copy">
              <div>
                <span className="p-tour-eyebrow">{t.guidedTour.themeEyebrow}</span>
                <h2 id="p-tour-week-start-title">{t.settings.calendarWeekStart}</h2>
                <p id="p-tour-week-start-body">{t.guidedTour.weekStartBody}</p>
              </div>
              {renderProgress()}
            </div>

            <div
              className="p-tour-week-start-options"
              role="radiogroup"
              aria-label={t.settings.calendarWeekStart}
            >
              <button
                type="button"
                role="radio"
                aria-checked={settings.calendarWeekStart === 'monday'}
                className={`p-tour-week-start-option${settings.calendarWeekStart === 'monday' ? ' is-active' : ''}`}
                onClick={() => updateSetting('calendarWeekStart', 'monday')}
              >
                <span className="p-tour-week-start-days" aria-hidden>
                  {t.calendar.weekdaysMonday.map((day: string, index: number) => (
                    <span className={index === 0 ? 'is-first' : undefined} key={day}>
                      {day}
                    </span>
                  ))}
                </span>
                <span>{t.settings.weekStartMonday}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={settings.calendarWeekStart === 'sunday'}
                className={`p-tour-week-start-option${settings.calendarWeekStart === 'sunday' ? ' is-active' : ''}`}
                onClick={() => updateSetting('calendarWeekStart', 'sunday')}
              >
                <span className="p-tour-week-start-days" aria-hidden>
                  {t.calendar.weekdaysSunday.map((day: string, index: number) => (
                    <span className={index === 0 ? 'is-first' : undefined} key={day}>
                      {day}
                    </span>
                  ))}
                </span>
                <span>{t.settings.weekStartSunday}</span>
              </button>
            </div>

            <div className="p-tour-theme-footer p-tour-week-start-footer">
              <p>{t.guidedTour.weekStartHint}</p>
              {renderActions()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep.kind === 'character') {
    return (
      <div className="p-tour-root p-tour-root--theme p-tour-root--character">
        {renderPreviewScrollGuard()}
        <div
          key={currentStep.id}
          ref={cardRef}
          className={`p-tour-theme-dock p-tour-week-start-dock${dockExiting ? ' is-exiting' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="p-tour-character-title"
          aria-describedby="p-tour-character-body"
        >
          <div className="p-tour-theme-dock-inner">
            <div className="p-tour-theme-copy">
              <div>
                <span className="p-tour-eyebrow">{t.guidedTour.themeEyebrow}</span>
                <h2 id="p-tour-character-title">{t.settings.homeDecoration}</h2>
                <p id="p-tour-character-body">{t.settings.showHomeCornerCharacter}</p>
              </div>
              {renderProgress()}
            </div>

            <div
              className="p-tour-week-start-options p-tour-character-options"
              role="radiogroup"
              aria-label={t.settings.showHomeCornerCharacter}
            >
              <button
                type="button"
                role="radio"
                aria-checked={settings.showHomeCornerCharacter}
                className={`p-tour-week-start-option p-tour-character-option${settings.showHomeCornerCharacter ? ' is-active' : ''}`}
                onClick={() => updateSetting('showHomeCornerCharacter', true)}
              >
                <span className="p-tour-character-preview" aria-hidden>
                  <span className="p-tour-character-preview-panel" />
                  <img src={homeCornerCharacterUrl} alt="" />
                </span>
                <span>{t.common.show}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!settings.showHomeCornerCharacter}
                className={`p-tour-week-start-option p-tour-character-option${!settings.showHomeCornerCharacter ? ' is-active' : ''}`}
                onClick={() => updateSetting('showHomeCornerCharacter', false)}
              >
                <span className="p-tour-character-preview is-hidden" aria-hidden>
                  <span className="p-tour-character-preview-panel" />
                </span>
                <span>{t.common.hide}</span>
              </button>
            </div>

            <div className="p-tour-theme-footer p-tour-week-start-footer">
              {mascotIllustratorName && mascotIllustratorUrl ? (
                <p className="p-tour-character-credit">
                  Illustration by{' '}
                  <a href={mascotIllustratorUrl} target="_blank" rel="noopener noreferrer">
                    {mascotIllustratorName}
                  </a>
                </p>
              ) : (
                <p>{t.settings.showHomeCornerCharacter}</p>
              )}
              {renderActions()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-tour-root${finishingFade ? ' is-finishing' : ''}`}>
      <div key={stepIndex} className="p-tour-dim-full" aria-hidden />

      {currentStep.kind === 'done' ? (
        <div
          ref={cardRef}
          className="p-tour-card p-tour-card--center p-tour-done-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="p-tour-h-done"
        >
          <div className="p-tour-card-inner">
            <div className="p-tour-done-mark" aria-hidden>
              ✓
            </div>
            <h2 id="p-tour-h-done">{copy?.title}</h2>
            <p className="p-tour-done-lead">{t.guidedTour.doneLead}</p>
            <section className="p-tour-done-next" aria-labelledby="p-tour-done-next-title">
              <h3 id="p-tour-done-next-title">{t.guidedTour.doneNextTitle}</h3>
              <ol>
                {t.guidedTour.doneNext.map((item: { title: string; body: string }, i: number) => (
                  <li key={item.title}>
                    <span className="p-tour-done-num" aria-hidden>
                      {i + 1}
                    </span>
                    <span className="p-tour-done-text">
                      <strong>{item.title}</strong>
                      <span>{item.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <button
              type="button"
              className="p-tour-primary p-tour-done-start"
              disabled={celebrating}
              aria-busy={celebrating}
              onClick={celebrateAndFinishTour}
            >
              {celebrating ? (
                <span className="p-tour-finish-spinner" aria-hidden />
              ) : (
                t.guidedTour.primaryDone
              )}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
