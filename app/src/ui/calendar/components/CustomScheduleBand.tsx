/**
 * 授業カレンダー週表示下の「追加予定」帯。
 * - 週の 7 日分だけ（月表示は日セル側）
 * - 送りは親から同期シグナルを受け、カレンダーと同じタイミングでスワイプ
 * - 折りたたみ可能
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  enumerateRange,
  parseIsoLocal,
  toIsoLocal,
  type CalendarWeekStart,
} from '../../../lib/date';
import {
  customCalEventsForIsoDate,
  formatCustomCalEventTimeLabel,
  type CustomCalEvent,
  type CustomCalWeekday,
} from '../../../domain/custom-cal-events';
import { useI18n } from '../../../i18n';
import { afterLayout, prefersReducedMotion, waitForTransition } from '../anim';

export interface CustomBandSwipeSignal {
  /** 同じ内容でも再トリガーできるよう単調増加キー */
  key: number;
  dir: 'prev' | 'next';
  from: { start: string; end: string };
  to: { start: string; end: string };
}

interface CustomScheduleBandProps {
  rangeStart: string;
  rangeEnd: string;
  weekStart: CalendarWeekStart;
  events: CustomCalEvent[];
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** カレンダー navigate と同じクリック内で渡す（速度・開始を揃える） */
  swipeSignal?: CustomBandSwipeSignal | null;
  /** 授業カレンダーと同じ「今日」判定（未指定時は端末の今日） */
  todayIso?: string;
  onAdd: (iso: string, weekday: CustomCalWeekday) => void;
  onSelect: (event: CustomCalEvent, anchorEl: HTMLElement) => void;
}

interface WeekRange {
  start: string;
  end: string;
}

interface BandSwipe {
  dir: 'prev' | 'next';
  from: WeekRange;
  to: WeekRange;
  key: number;
}

interface BandGridProps {
  weekStart: CalendarWeekStart;
  events: CustomCalEvent[];
  todayIso: string;
  onAdd: (iso: string, weekday: CustomCalWeekday) => void;
  onSelect: (event: CustomCalEvent, anchorEl: HTMLElement) => void;
}

function useBandSwipe({
  rangeStart,
  rangeEnd,
  collapsed,
  signal,
}: {
  rangeStart: string;
  rangeEnd: string;
  collapsed: boolean;
  signal: CustomBandSwipeSignal | null;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const lastSignalKeyRef = useRef(0);
  const [displayRange, setDisplayRange] = useState<WeekRange>({
    start: rangeStart,
    end: rangeEnd,
  });
  const [swipe, setSwipe] = useState<BandSwipe | null>(null);

  useLayoutEffect(() => {
    if (!signal || signal.key === lastSignalKeyRef.current) return;
    lastSignalKeyRef.current = signal.key;
    if (collapsed || prefersReducedMotion()) {
      setDisplayRange(signal.to);
      setSwipe(null);
      return;
    }
    const incoming: BandSwipe = {
      key: signal.key,
      dir: signal.dir,
      from: signal.from,
      to: signal.to,
    };
    setDisplayRange(incoming.from);
    setSwipe(incoming);
  }, [signal, collapsed]);

  useLayoutEffect(() => {
    if (!swipe || collapsed) return;
    const track = trackRef.current;
    if (!track) return;

    let cancelled = false;
    const commit = () => {
      setDisplayRange(swipe.to);
      setSwipe(null);
    };
    const wait = waitForTransition(
      track,
      'transform',
      () => {
        if (!cancelled) commit();
      },
      500,
    );
    afterLayout(() => {
      if (!cancelled) track.classList.add('is-mid');
    });
    return () => {
      cancelled = true;
      wait.cancel();
    };
  }, [swipe, collapsed]);

  useLayoutEffect(() => {
    if (swipe) return;
    if (rangeStart === displayRange.start && rangeEnd === displayRange.end) return;
    setDisplayRange({ start: rangeStart, end: rangeEnd });
  }, [rangeStart, rangeEnd, displayRange, swipe]);

  useEffect(() => {
    if (!collapsed) return;
    setDisplayRange({ start: rangeStart, end: rangeEnd });
    setSwipe(null);
  }, [collapsed, rangeStart, rangeEnd]);

  return { activeSwipe: swipe, displayRange, trackRef };
}

function BandDayGrid({
  rangeStart,
  rangeEnd,
  weekStart,
  events,
  todayIso,
  onAdd,
  onSelect,
}: BandGridProps & { rangeStart: string; rangeEnd: string }) {
  const { t } = useI18n();
  const days = enumerateRange(rangeStart, rangeEnd);
  const weekdayLabels =
    weekStart === 'sunday' ? t.calendar.weekdaysSunday : t.calendar.weekdaysMonday;

  return (
    <div className="p-cal-custom-band-grid">
      {days.map((iso) => {
        const d = parseIsoLocal(iso);
        const weekday = d.getDay() as CustomCalWeekday;
        const dayEvents = customCalEventsForIsoDate(events, iso);
        const labelIndex = weekStart === 'sunday' ? weekday : (weekday + 6) % 7;
        const headLabel = weekdayLabels[labelIndex] ?? '';
        const isToday = iso === todayIso;
        return (
          <div
            key={iso}
            className={`p-cal-custom-band-cell${isToday ? ' is-today' : ''}`}
            aria-current={isToday ? 'date' : undefined}
          >
            <div className="p-cal-custom-band-cell-head">
              <span className="p-cal-custom-band-wd">{headLabel}</span>
              <button
                type="button"
                className="p-cal-custom-band-add"
                aria-label={t.calendar.customBandAddAria}
                title={t.calendar.customBandAdd}
                onClick={() => onAdd(iso, weekday)}
              >
                ＋
              </button>
            </div>
            <div className="p-cal-custom-band-body">
              {dayEvents.map((ev) => {
                const timeLabel = formatCustomCalEventTimeLabel(ev, t.calendar.customEventAllDay);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    className="p-cal-ev p-cal-custom-ev"
                    data-cal-kind="custom"
                    data-custom-event-id={ev.id}
                    aria-label={`${ev.title} · ${timeLabel}`}
                    onClick={(e) => onSelect(ev, e.currentTarget)}
                  >
                    <span className="p-cal-custom-ev-badge" aria-hidden>
                      {t.calendar.customEventBadge}
                    </span>
                    <span className="p-cal-ev-title">{ev.title}</span>
                    <span className="p-cal-ev-meta">{timeLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CustomBandHeader({
  collapsed,
  eventCount,
  panelId,
  onToggle,
}: {
  collapsed: boolean;
  eventCount: number;
  panelId: string;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="p-cal-custom-band-chrome">
      <button
        type="button"
        className="p-cal-custom-band-toggle"
        aria-expanded={!collapsed}
        aria-controls={panelId}
        aria-label={
          collapsed
            ? t.calendar.customBandExpandAria(eventCount)
            : t.calendar.customBandCollapseAria
        }
        onClick={onToggle}
      >
        <span className="p-cal-custom-band-label">{t.calendar.customBandLabel}</span>
        {eventCount > 0 ? <span className="p-cal-custom-band-count">{eventCount}</span> : null}
        <span className="p-cal-custom-band-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {collapsed && eventCount === 0 ? (
        <span className="p-cal-custom-band-hint">{t.calendar.customBandHint}</span>
      ) : null}
    </div>
  );
}

function CustomBandContent({
  activeSwipe,
  displayRange,
  trackRef,
  gridProps,
}: {
  activeSwipe: BandSwipe | null;
  displayRange: WeekRange;
  trackRef: RefObject<HTMLDivElement | null>;
  gridProps: BandGridProps;
}) {
  if (!activeSwipe) {
    return (
      <BandDayGrid rangeStart={displayRange.start} rangeEnd={displayRange.end} {...gridProps} />
    );
  }
  const first = activeSwipe.dir === 'next' ? activeSwipe.from : activeSwipe.to;
  const second = activeSwipe.dir === 'next' ? activeSwipe.to : activeSwipe.from;
  const swipeClass =
    activeSwipe.dir === 'next'
      ? 'p-cal-swipe-track p-cal-swipe--next'
      : 'p-cal-swipe-track p-cal-swipe--prev';
  return (
    <div className="p-cal-swipe-viewport p-cal-custom-band-swipe">
      <div ref={trackRef} className={swipeClass}>
        {[first, second].map((range) => (
          <div className="p-cal-swipe-cell" key={range.start}>
            <BandDayGrid rangeStart={range.start} rangeEnd={range.end} {...gridProps} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CustomScheduleBand({
  rangeStart,
  rangeEnd,
  weekStart,
  events,
  collapsed,
  onCollapsedChange,
  swipeSignal = null,
  todayIso: todayIsoProp,
  onAdd,
  onSelect,
}: CustomScheduleBandProps) {
  const { t } = useI18n();
  const todayIso = todayIsoProp ?? toIsoLocal(new Date());
  const panelId = useId();
  const { activeSwipe, displayRange, trackRef } = useBandSwipe({
    rangeStart,
    rangeEnd,
    collapsed,
    signal: swipeSignal,
  });

  const eventCountInRange = enumerateRange(
    activeSwipe?.to.start ?? displayRange.start,
    activeSwipe?.to.end ?? displayRange.end,
  ).reduce((n, iso) => n + customCalEventsForIsoDate(events, iso).length, 0);

  const gridProps: BandGridProps = {
    weekStart,
    events,
    todayIso,
    onAdd,
    onSelect,
  } as const;

  return (
    <div
      className={`p-cal-custom-band${collapsed ? ' is-collapsed' : ''}`}
      aria-label={t.calendar.customBandLabel}
    >
      <CustomBandHeader
        collapsed={collapsed}
        eventCount={eventCountInRange}
        panelId={panelId}
        onToggle={() => onCollapsedChange(!collapsed)}
      />

      <div
        id={panelId}
        className={`p-cal-custom-band-panel${collapsed ? ' is-collapsed' : ''}`}
        aria-hidden={collapsed}
        inert={collapsed ? true : undefined}
      >
        <div className="p-cal-custom-band-panel-inner">
          <CustomBandContent
            activeSwipe={activeSwipe}
            displayRange={displayRange}
            trackRef={trackRef}
            gridProps={gridProps}
          />
        </div>
      </div>
    </div>
  );
}
