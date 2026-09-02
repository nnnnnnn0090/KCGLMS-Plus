/**
 * 初回ホーム表示時のオンボーディング。
 * 言語とテーマの初期設定後、実画面上で主要機能を短く案内する。
 */

import { useState, useEffect, useLayoutEffect, useCallback, useId, useMemo, useRef } from 'react';
import { PAGE, SK } from '../../../shared/constants';
import storage from '../../../lib/storage';
import { usePortalDom } from '../../../context/portalDom';
import { useSettings } from '../../../context/settings';
import { useI18n } from '../../../i18n';
import { LanguagePicker } from './LanguagePicker';
import type { AppLanguage } from '../../../i18n/messages';
import {
  ASSIGNMENT_STEP_IDS,
  CALENDAR_OVERVIEW_STEP_IDS,
  DOCK_EXIT_MS,
  FINISH_FADE_MS,
  FINISH_WAIT_MS,
  HOLE_RETRY_MAX,
  HOLE_RETRY_MS,
  SCROLL_SETTLE_MS,
  STEPS,
} from './guided-tour/constants';
import { GuidedTourSteps } from './guided-tour/GuidedTourSteps';
import {
  computeSpotlightCardCss,
  isSetupDockStep,
  querySpotlightElement,
  readSpotlightHole,
  sameHole,
  scrollSpotlightToOverlayCenter,
  scrollThemePreviewToCalendar,
} from './guided-tour/spotlight-geometry';
import type { GuidedTourProps, Hole, TourPhase } from './guided-tour/types';

export type { GuidedTourProps } from './guided-tour/types';

export function GuidedTour({
  route,
  settingsReady,
  hideAssignmentCalendar = false,
  guidedTourReplayToken = 0,
}: GuidedTourProps) {
  const { language, t } = useI18n();
  const { settings, updateSetting, updateTheme } = useSettings();
  const { overlayRoot } = usePortalDom();
  const steps = useMemo(
    () =>
      hideAssignmentCalendar ? STEPS.filter((step) => !ASSIGNMENT_STEP_IDS.has(step.id)) : STEPS,
    [hideAssignmentCalendar],
  );
  const [phase, setPhase] = useState<TourPhase>('loading');
  const [stepIndex, setStepIndex] = useState(0);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [hole, setHole] = useState<Hole | null>(null);
  const [cardSize, setCardSize] = useState({ w: 0, h: 0 });
  const [dockExiting, setDockExiting] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [finishingFade, setFinishingFade] = useState(false);
  const maskSuffix = useId().replace(/:/g, '');
  const maskId = `p-tour-mask-${maskSuffix}`;
  const cardRef = useRef<HTMLDivElement>(null);
  const outlinedTargetRef = useRef<HTMLElement | null>(null);
  const retryRef = useRef(0);
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
      void storage.set({ [SK.portalLanguagePickerDone]: true }).then(() => {
        setStepIndex(0);
        setPhase('tour');
      });
    },
    [updateSetting],
  );

  const updateViewport = useCallback(() => {
    const next = { w: window.innerWidth, h: window.innerHeight };
    setViewport((current) => (current.w === next.w && current.h === next.h ? current : next));
  }, []);

  const commitHole = useCallback((next: Hole | null) => {
    setHole((current) => (sameHole(current, next) ? current : next));
  }, []);

  const currentStep = steps[stepIndex];

  const refreshHole = useCallback(() => {
    if (!currentStep || phase !== 'tour' || currentStep.kind !== 'spotlight') {
      commitHole(null);
      return;
    }
    commitHole(readSpotlightHole(currentStep, overlayRoot));
  }, [commitHole, currentStep, overlayRoot, phase]);

  const finishTour = useCallback(() => {
    if (dockTransitionTimerRef.current !== null) {
      window.clearTimeout(dockTransitionTimerRef.current);
      dockTransitionTimerRef.current = null;
    }
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = null;
    }
    void storage.set({ [SK.portalGuidedTourDone]: true });
    overlayRoot.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setCelebrating(false);
    setFinishingFade(false);
    setPhase('off');
  }, [overlayRoot]);

  const celebrateAndFinishTour = useCallback(() => {
    if (celebrating) return;
    void storage.set({ [SK.portalGuidedTourDone]: true });
    setCelebrating(true);
    celebrationTimerRef.current = window.setTimeout(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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

  const moveToStep = useCallback(
    (nextIndex: number) => {
      if (dockExiting) return;
      const boundedIndex = Math.min(steps.length - 1, Math.max(0, nextIndex));
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!isSetupDockStep(currentStep) || reduceMotion) {
        setStepIndex(boundedIndex);
        return;
      }
      setDockExiting(true);
      dockTransitionTimerRef.current = window.setTimeout(() => {
        dockTransitionTimerRef.current = null;
        setStepIndex(boundedIndex);
        setDockExiting(false);
      }, DOCK_EXIT_MS);
    },
    [currentStep, dockExiting, steps.length],
  );

  const goNext = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      finishTour();
      return;
    }
    moveToStep(stepIndex + 1);
  }, [finishTour, moveToStep, stepIndex, steps.length]);

  const goBack = useCallback(() => {
    moveToStep(stepIndex - 1);
  }, [moveToStep, stepIndex]);

  useEffect(
    () => () => {
      if (dockTransitionTimerRef.current !== null) {
        window.clearTimeout(dockTransitionTimerRef.current);
      }
      if (celebrationTimerRef.current !== null) {
        window.clearTimeout(celebrationTimerRef.current);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    updateViewport();
  }, [updateViewport, phase, stepIndex]);

  useLayoutEffect(() => {
    if (phase !== 'tour' || !currentStep) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (
      currentStep.kind === 'theme' ||
      currentStep.kind === 'weekStart' ||
      currentStep.kind === 'character'
    ) {
      scrollThemePreviewToCalendar(overlayRoot, reduceMotion ? 'auto' : 'smooth');
      return;
    }
    if (currentStep.kind === 'done') {
      overlayRoot.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [currentStep, overlayRoot, phase]);

  useLayoutEffect(() => {
    if (phase !== 'tour' || !currentStep) return;
    retryRef.current = 0;
    outlinedTargetRef.current?.classList.remove('p-tour-target-outline');
    outlinedTargetRef.current = null;

    if (currentStep.kind !== 'spotlight') {
      commitHole(null);
      return;
    }

    const target = querySpotlightElement(currentStep, overlayRoot);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const keepCurrentScroll = [
      'calendar-mode',
      'kogi-hover',
      'kogi-context',
      'assignment',
    ].includes(currentStep.id);
    if (target) {
      if (CALENDAR_OVERVIEW_STEP_IDS.has(currentStep.id)) {
        target.classList.add('p-tour-target-outline');
        outlinedTargetRef.current = target;
      }
      if (!keepCurrentScroll) {
        scrollSpotlightToOverlayCenter(target, overlayRoot, reduceMotion ? 'auto' : 'smooth');
      }
    }
    commitHole(readSpotlightHole(currentStep, overlayRoot));

    let settleTimer: number | null = null;
    if (target && !reduceMotion && !keepCurrentScroll) {
      settleTimer = window.setTimeout(() => {
        updateViewport();
        commitHole(readSpotlightHole(currentStep, overlayRoot));
      }, SCROLL_SETTLE_MS);
    }
    return () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      target?.classList.remove('p-tour-target-outline');
      if (outlinedTargetRef.current === target) outlinedTargetRef.current = null;
    };
  }, [commitHole, currentStep, overlayRoot, phase, updateViewport]);

  useEffect(() => {
    if (phase !== 'tour' || currentStep?.kind !== 'spotlight') return;
    let frame = 0;
    const onResize = () => {
      updateViewport();
      refreshHole();
    };
    const onScroll = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        refreshHole();
      });
    };
    window.addEventListener('resize', onResize);
    overlayRoot.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      overlayRoot.removeEventListener('scroll', onScroll, true);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [currentStep, overlayRoot, phase, refreshHole, updateViewport]);

  useEffect(() => {
    if (phase !== 'tour' || currentStep?.kind !== 'spotlight') return;
    if (hole !== null) {
      retryRef.current = 0;
      return;
    }
    if (retryRef.current >= HOLE_RETRY_MAX) return;
    retryRef.current += 1;
    const timer = window.setTimeout(() => {
      commitHole(readSpotlightHole(currentStep, overlayRoot));
    }, HOLE_RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [commitHole, currentStep, hole, overlayRoot, phase]);

  useLayoutEffect(() => {
    if (phase !== 'tour') return;
    const card = cardRef.current;
    if (!card) return;
    const measure = () => {
      const r = card.getBoundingClientRect();
      setCardSize((current) =>
        current.w === r.width && current.h === r.height ? current : { w: r.width, h: r.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, [phase, stepIndex]);

  useLayoutEffect(() => {
    if (phase !== 'tour') return;
    const primary = cardRef.current?.querySelector('button.p-tour-primary');
    if (primary instanceof HTMLElement) primary.focus();
  }, [phase, stepIndex]);

  useEffect(() => {
    if (phase !== 'tour') return;
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

  if (phase !== 'tour' || !currentStep) return null;

  const vw = viewport.w || (typeof window !== 'undefined' ? window.innerWidth : 400);
  const vh = viewport.h || (typeof window !== 'undefined' ? window.innerHeight : 600);
  const spotlightCardCss =
    currentStep.kind === 'spotlight'
      ? computeSpotlightCardCss(currentStep, hole, vw, vh, cardSize, CALENDAR_OVERVIEW_STEP_IDS)
      : undefined;

  return (
    <GuidedTourSteps
      currentStep={currentStep}
      steps={steps}
      stepIndex={stepIndex}
      hole={hole}
      cardRef={cardRef}
      cardSize={cardSize}
      dockExiting={dockExiting}
      celebrating={celebrating}
      finishingFade={finishingFade}
      maskId={maskId}
      viewport={{ w: vw, h: vh }}
      spotlightCardCss={spotlightCardCss}
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
