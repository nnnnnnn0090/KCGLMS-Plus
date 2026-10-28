/**
 * 初回ホーム表示時のオンボーディング。
 *
 *   言語の選択 → 初期設定（テーマ・週の始まり・キャラクター・同期）
 *   → ホームの案内（SpotlightTour）→ 完了
 */

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { PAGE, SK } from '../../../shared/constants';
import storage from '../../../lib/storage';
import { usePortalDom } from '../../../context/portalDom';
import { useSettings } from '../../../context/settings';
import { useI18n } from '../../../i18n';
import { LanguagePicker } from './LanguagePicker';
import type { AppLanguage } from '../../../i18n/messages';
import {
  DOCK_EXIT_MS,
  DONE_STEP,
  FINISH_FADE_MS,
  FINISH_WAIT_MS,
  STEPS,
} from './guided-tour/constants';
import { GuidedTourSteps } from './guided-tour/GuidedTourSteps';
import { isSetupDockStep, scrollThemePreviewToCalendar } from './guided-tour/setup-scroll';
import { SpotlightTour } from './guided-tour/SpotlightTour';
import type { GuidedTourProps, TourPhase } from './guided-tour/types';

export type { GuidedTourProps } from './guided-tour/types';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function GuidedTour({ route, settingsReady, guidedTourReplayToken = 0 }: GuidedTourProps) {
  const { language, t } = useI18n();
  const { settings, updateSetting, updateTheme } = useSettings();
  const { overlayRoot } = usePortalDom();
  const steps = STEPS;
  const [phase, setPhase] = useState<TourPhase>('loading');
  const [stepIndex, setStepIndex] = useState(0);
  const [dockExiting, setDockExiting] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [finishingFade, setFinishingFade] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const dockTransitionTimerRef = useRef<number | null>(null);
  const celebrationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (route.page !== PAGE.HOME || !settingsReady) {
      setPhase('off');
      return;
    }
    let cancelled = false;
    void storage.get([SK.portalGuidedTourDone, SK.portalLanguagePickerDone]).then((data) => {
      if (cancelled) return;
      if (data[SK.portalGuidedTourDone]) {
        setPhase('off');
        return;
      }
      setPhase(data[SK.portalLanguagePickerDone] ? 'tour' : 'language');
    });
    return () => {
      cancelled = true;
    };
  }, [route.page, settingsReady]);

  useEffect(() => {
    if (guidedTourReplayToken === 0) return;
    if (route.page !== PAGE.HOME || !settingsReady) return;
    setStepIndex(0);
    setCelebrating(false);
    setFinishingFade(false);
    setPhase('tour');
  }, [guidedTourReplayToken, route.page, settingsReady]);

  const handleLanguageChange = useCallback(
    (nextLanguage: AppLanguage) => {
      updateSetting('language', nextLanguage);
    },
    [updateSetting],
  );

  const handleLanguageConfirm = useCallback(
    (nextLanguage: AppLanguage) => {
      updateSetting('language', nextLanguage);
      // 保存の完了を待たずに次へ進む。保存に時間がかかっても、空の枠のまま止まらないようにする。
      setStepIndex(0);
      setPhase('tour');
      void storage.set({ [SK.portalLanguagePickerDone]: true });
    },
    [updateSetting],
  );

  const currentStep = phase === 'done' ? DONE_STEP : steps[stepIndex];

  const clearTimers = useCallback(() => {
    if (dockTransitionTimerRef.current !== null) {
      window.clearTimeout(dockTransitionTimerRef.current);
      dockTransitionTimerRef.current = null;
    }
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = null;
    }
  }, []);

  const finishTour = useCallback(() => {
    clearTimers();
    void storage.set({ [SK.portalGuidedTourDone]: true });
    overlayRoot.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setCelebrating(false);
    setFinishingFade(false);
    setDockExiting(false);
    setPhase('off');
  }, [clearTimers, overlayRoot]);

  const celebrateAndFinishTour = useCallback(() => {
    if (celebrating) return;
    void storage.set({ [SK.portalGuidedTourDone]: true });
    setCelebrating(true);
    celebrationTimerRef.current = window.setTimeout(() => {
      if (prefersReducedMotion()) {
        celebrationTimerRef.current = null;
        overlayRoot.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        setPhase('off');
        return;
      }
      setFinishingFade(true);
      celebrationTimerRef.current = window.setTimeout(() => {
        celebrationTimerRef.current = null;
        overlayRoot.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        setPhase('off');
      }, FINISH_FADE_MS);
    }, FINISH_WAIT_MS);
  }, [celebrating, overlayRoot]);

  /** 下のドックを閉じるアニメーションのあとで次へ進む */
  const leaveStep = useCallback(
    (next: () => void) => {
      if (dockExiting) return;
      if (!isSetupDockStep(currentStep) || prefersReducedMotion()) {
        next();
        return;
      }
      setDockExiting(true);
      dockTransitionTimerRef.current = window.setTimeout(() => {
        dockTransitionTimerRef.current = null;
        next();
        setDockExiting(false);
      }, DOCK_EXIT_MS);
    },
    [currentStep, dockExiting],
  );

  const goNext = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      leaveStep(() => setPhase('spotlight'));
      return;
    }
    leaveStep(() => setStepIndex(stepIndex + 1));
  }, [leaveStep, stepIndex, steps.length]);

  const goBack = useCallback(() => {
    if (stepIndex <= 0) return;
    leaveStep(() => setStepIndex(stepIndex - 1));
  }, [leaveStep, stepIndex]);

  const backFromSpotlight = useCallback(() => {
    setStepIndex(steps.length - 1);
    setPhase('tour');
  }, [steps.length]);

  const completeSpotlight = useCallback(() => {
    overlayRoot.scrollTo({ top: 0, left: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    setPhase('done');
  }, [overlayRoot]);

  useEffect(() => clearTimers, [clearTimers]);

  // 初期設定の手順では、選んだテーマが確かめやすい位置へスクロールする。
  useLayoutEffect(() => {
    if (phase !== 'tour' || !isSetupDockStep(currentStep) || currentStep?.kind === 'sync') return;
    scrollThemePreviewToCalendar(overlayRoot, prefersReducedMotion() ? 'auto' : 'smooth');
  }, [currentStep, overlayRoot, phase]);

  useLayoutEffect(() => {
    if (phase !== 'tour' && phase !== 'done') return;
    const primary = cardRef.current?.querySelector('button.p-tour-primary');
    if (primary instanceof HTMLElement) primary.focus({ preventScroll: true });
  }, [phase, stepIndex]);

  // ホームの案内は SpotlightTour が自分でキーを扱う。
  useEffect(() => {
    if (phase !== 'tour' && phase !== 'done') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      finishTour();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [finishTour, phase]);

  if (phase === 'language') {
    return (
      <LanguagePicker
        initialLanguage={settings.language}
        onChange={handleLanguageChange}
        onConfirm={handleLanguageConfirm}
      />
    );
  }

  if (phase === 'spotlight') {
    return (
      <SpotlightTour
        overlayRoot={overlayRoot}
        t={t}
        onBack={backFromSpotlight}
        onComplete={completeSpotlight}
        onClose={finishTour}
      />
    );
  }

  if ((phase !== 'tour' && phase !== 'done') || !currentStep) return null;

  return (
    <GuidedTourSteps
      currentStep={currentStep}
      steps={phase === 'done' ? [DONE_STEP] : steps}
      stepIndex={phase === 'done' ? 0 : stepIndex}
      cardRef={cardRef}
      dockExiting={dockExiting}
      celebrating={celebrating}
      finishingFade={finishingFade}
      overlayRoot={overlayRoot}
      settings={settings}
      language={language}
      t={t}
      updateTheme={updateTheme}
      updateSetting={updateSetting}
      goBack={goBack}
      goNext={goNext}
      finishTour={finishTour}
      celebrateAndFinishTour={celebrateAndFinishTour}
    />
  );
}
