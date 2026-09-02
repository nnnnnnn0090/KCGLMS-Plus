/**
 * 週／月切替ツールバーとカレンダー本体（`calBody`）の共通レイアウトです。
 * `CalendarPanel` と `AssignmentCalendar` の双方から利用されます。
 */

import type { RefObject } from 'react';
import { useI18n } from '../../../i18n';

export interface CalendarShellProps {
  viewMode: 'week' | 'month';
  modeTitle: string;
  modeGroupLabel: string;
  rangeLabel: string;
  switchMode: (mode: 'week' | 'month') => void;
  navigate: (dir: 'prev' | 'next') => void;
  calBodyRef: RefObject<HTMLDivElement | null>;
  toolbarHidden?: boolean;
  bodyHidden?: boolean;
  navDisabled?: boolean;
  /** true のとき週/月・前後ナビを無効化（課題未取り込みなど） */
  controlsDisabled?: boolean;
}

export function CalendarShell({
  viewMode,
  modeTitle,
  modeGroupLabel,
  rangeLabel,
  switchMode,
  navigate,
  calBodyRef,
  toolbarHidden = false,
  bodyHidden = false,
  navDisabled = false,
  controlsDisabled = false,
}: CalendarShellProps) {
  const { t } = useI18n();
  const navLocked = navDisabled || controlsDisabled;
  return (
    <>
      <div className="p-cal-toolbar" hidden={toolbarHidden}>
        <span className="p-cal-title">{modeTitle}</span>

        {/* 週 / 月 切替ボタン */}
        <div className="p-cal-mode" role="group" aria-label={modeGroupLabel}>
          <button
            type="button"
            className={`p-cal-mode-btn${viewMode === 'week' ? ' is-active' : ''}`}
            disabled={controlsDisabled}
            onClick={() => switchMode('week')}
          >
            {t.calendar.week}
          </button>
          <button
            type="button"
            className={`p-cal-mode-btn${viewMode === 'month' ? ' is-active' : ''}`}
            disabled={controlsDisabled}
            onClick={() => switchMode('month')}
          >
            {t.calendar.month}
          </button>
        </div>

        {/* 前後ナビゲーション */}
        <div className="p-cal-nav">
          <button
            type="button"
            className="p-cal-btn"
            aria-label={t.calendar.previous}
            disabled={navLocked}
            onClick={() => navigate('prev')}
          >
            {t.calendar.previousButton}
          </button>
          <span className="p-cal-range">{rangeLabel}</span>
          <button
            type="button"
            className="p-cal-btn"
            aria-label={t.calendar.next}
            disabled={navLocked}
            onClick={() => navigate('next')}
          >
            {t.calendar.next}
          </button>
        </div>
      </div>

      {/* カレンダーグリッドの描画先（innerHTML で注入される） */}
      <div className="p-panel-body p-cal-scroll" hidden={bodyHidden}>
        <div className="p-cal-body" ref={calBodyRef} data-cal-mode={viewMode} />
      </div>
    </>
  );
}
