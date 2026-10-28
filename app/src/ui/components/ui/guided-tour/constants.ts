import type { TourStep } from './types';

/**
 * 初期設定の手順（中央のカード・下のドック）。このあと SpotlightTour でホームを案内し、
 * 最後に DONE_STEP を出す。
 */
export const STEPS: TourStep[] = [
  { kind: 'welcome', id: 'welcome' },
  { kind: 'theme', id: 'theme' },
  { kind: 'font', id: 'font' },
  { kind: 'weekStart', id: 'week-start' },
  { kind: 'character', id: 'character' },
  // 初期設定の最後に聞く。ここで選んだばかりの設定は、ほかの端末の古い設定より優先される。
  { kind: 'sync', id: 'sync' },
];

export const DONE_STEP: TourStep = { kind: 'done', id: 'done' };

export const PROGRESS_WIDTH_CLASS: Record<string, string> = {
  '1/6': 'tw-w-tour-progress-1-6',
  '2/6': 'tw-w-tour-progress-2-6',
  '3/6': 'tw-w-tour-progress-3-6',
  '4/6': 'tw-w-tour-progress-4-6',
  '5/6': 'tw-w-tour-progress-5-6',
  '6/6': 'tw-w-full',
};

/** チュートリアルで勧めるテーマ（先頭が既定のパウダー） */
export const RECOMMENDED_THEME_KEYS = ['powder', 'dark', 'tokyoNight', 'cherryBlossom'] as const;

export const mascotIllustratorName = import.meta.env.VITE_MASCOT_ILLUSTRATOR_NAME?.trim() ?? '';
export const mascotIllustratorUrl = import.meta.env.VITE_MASCOT_ILLUSTRATOR_URL?.trim() ?? '';

export const DOCK_EXIT_MS = 180;
export const FINISH_WAIT_MS = 2000;
export const FINISH_FADE_MS = 360;
