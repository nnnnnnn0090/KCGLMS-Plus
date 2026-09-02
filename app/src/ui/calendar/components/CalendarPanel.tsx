/**
 * 授業・補修・キャンパスなど、ポータル公式カレンダー API を表示する汎用パネルです。
 * `useCalendarPanel` が `postMessage` とフェッチを束ね、`CalendarShell` がツールバーとグリッド領域を描画します。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import kogiWeekSleepMascotUrl from '../../../assets/mascot.png';
import { useSettings } from '../../../context/settings';
import { useCustomCalEvents, type CustomCalEventInput } from '../../../context/custom-cal-events';
import {
  CUSTOM_CAL_EVENTS_MAX,
  customCalEventsFingerprint,
  type CustomCalEvent,
  type CustomCalWeekday,
} from '../../../domain/custom-cal-events';
import {
  nextWeekRange,
  parseIsoLocal,
  prevWeekRange,
  type CalendarWeekStart,
} from '../../../lib/date';
import { prefersReducedMotion } from '../anim';
import { useCalendarPanel, type CalendarPanelConfig } from '../use-panel';
import { useI18n } from '../../../i18n';
import { CalendarShell } from './CalendarShell';
import { CustomScheduleBand, type CustomBandSwipeSignal } from './CustomScheduleBand';
import { CustomCalEventModal, type CustomCalEditorTarget } from './CustomCalEventModal';
import {
  CustomCalEventPreview,
  previewAnchorFromElement,
  type CustomCalEventPreviewAnchor,
} from './CustomCalEventPreview';

interface CustomPreviewState {
  eventId: string;
  anchor: CustomCalEventPreviewAnchor;
}

function CustomEventOverlays({
  preview,
  previewEvent,
  editor,
  weekStart,
  onEdit,
  onDeletePreview,
  onClosePreview,
  onSave,
  onDeleteEditor,
  onCloseEditor,
}: {
  preview: CustomPreviewState | null;
  previewEvent: CustomCalEvent | null;
  editor: CustomCalEditorTarget | null;
  weekStart: CalendarWeekStart;
  onEdit: () => void;
  onDeletePreview: () => void;
  onClosePreview: () => void;
  onSave: (input: CustomCalEventInput) => void;
  onDeleteEditor: () => void;
  onCloseEditor: () => void;
}) {
  return (
    <>
      {preview && previewEvent ? (
        <CustomCalEventPreview
          key={preview.eventId}
          event={previewEvent}
          anchor={preview.anchor}
          weekStart={weekStart}
          onEdit={onEdit}
          onDelete={onDeletePreview}
          onClose={onClosePreview}
        />
      ) : null}
      {editor ? (
        <CustomCalEventModal
          key={
            editor.mode === 'edit'
              ? `edit-${editor.event.id}`
              : `new-${editor.presetIso ?? 'x'}-${editor.presetWeekday ?? 'x'}`
          }
          target={editor}
          weekStart={weekStart}
          onSave={onSave}
          onDelete={editor.mode === 'edit' ? onDeleteEditor : undefined}
          onClose={onCloseEditor}
        />
      ) : null}
    </>
  );
}

function BasicCalendarPanel(props: CalendarPanelConfig) {
  const { settings } = useSettings();
  const {
    calBodyRef,
    panelVisible,
    viewMode,
    calKind,
    modeTitle,
    modeGroupLabel,
    title,
    switchMode,
    navigate,
    toolbarLocked,
  } = useCalendarPanel(props);
  const showSleepMascot = Boolean(props.sleepMascotSlot && settings.showKogiCalMascot);

  return (
    <div className="p-panel-cal-wrap" hidden={!panelVisible}>
      <section
        className={`p-panel p-panel-cal${viewMode === 'month' ? ' is-month' : ''}`}
        data-cal-kind={calKind || undefined}
      >
        <CalendarShell
          viewMode={viewMode}
          modeTitle={modeTitle}
          modeGroupLabel={modeGroupLabel}
          rangeLabel={title}
          switchMode={switchMode}
          navigate={navigate}
          calBodyRef={calBodyRef}
          navDisabled={toolbarLocked}
          controlsDisabled={toolbarLocked}
        />
      </section>
      {showSleepMascot ? (
        <img
          className="p-cal-kogi-sleep-mascot"
          src={kogiWeekSleepMascotUrl}
          alt=""
          decoding="async"
          aria-hidden
        />
      ) : null}
    </div>
  );
}

function KogiCalendarPanel(props: CalendarPanelConfig) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const {
    events: customEvents,
    addEvent,
    updateEvent,
    deleteEvent,
    bandCollapsed,
    setBandCollapsed,
  } = useCustomCalEvents();

  const customEventsFp = useMemo(() => customCalEventsFingerprint(customEvents), [customEvents]);
  const mergedKogiDisplayDeps = [props.kogiDisplayDeps ?? '', customEventsFp]
    .filter(Boolean)
    .join('\0');

  const {
    calBodyRef,
    panelVisible,
    viewMode,
    calKind,
    modeTitle,
    modeGroupLabel,
    title,
    switchMode,
    navigate,
    toolbarLocked,
    weekParams,
    weekStart,
  } = useCalendarPanel({
    ...props,
    kogiDisplayDeps: mergedKogiDisplayDeps,
    customCalEvents: customEvents,
  });

  const [editor, setEditor] = useState<CustomCalEditorTarget | null>(null);
  const [preview, setPreview] = useState<CustomPreviewState | null>(null);
  const [bandSwipeSignal, setBandSwipeSignal] = useState<CustomBandSwipeSignal | null>(null);
  const bandSwipeKeyRef = useRef(0);

  const showSleepMascot = Boolean(props.sleepMascotSlot && settings.showKogiCalMascot);

  const previewEvent = useMemo(() => {
    if (!preview) return null;
    return customEvents.find((ev) => ev.id === preview.eventId) ?? null;
  }, [preview, customEvents]);

  /** 週表示のみ帯。月は日セルに追加予定を載せる */
  const bandRange = useMemo(() => {
    if (viewMode === 'week' && weekParams?.start && weekParams?.end) {
      return { start: weekParams.start, end: weekParams.end };
    }
    return null;
  }, [viewMode, weekParams]);

  /** 帯スワイプをカレンダー applyCalSwipe と同じクリック内で開始する */
  const navigateSynced = useCallback(
    (dir: 'prev' | 'next') => {
      setPreview(null);
      if (
        bandRange &&
        viewMode === 'week' &&
        weekParams &&
        !bandCollapsed &&
        !toolbarLocked &&
        !prefersReducedMotion()
      ) {
        const to = dir === 'prev' ? prevWeekRange(weekParams) : nextWeekRange(weekParams);
        const signal: CustomBandSwipeSignal = {
          key: ++bandSwipeKeyRef.current,
          dir,
          from: { start: bandRange.start, end: bandRange.end },
          to,
        };
        flushSync(() => {
          setBandSwipeSignal(signal);
        });
      }
      navigate(dir);
    },
    [bandRange, viewMode, weekParams, bandCollapsed, toolbarLocked, navigate],
  );

  const openNew = useCallback((iso: string, weekday: CustomCalWeekday) => {
    setPreview(null);
    setEditor({ mode: 'new', presetIso: iso, presetWeekday: weekday });
  }, []);

  const openPreview = useCallback((event: CustomCalEvent, anchorEl: HTMLElement) => {
    setEditor(null);
    setPreview((prev) => {
      if (prev?.eventId === event.id) return null;
      return {
        eventId: event.id,
        anchor: previewAnchorFromElement(anchorEl),
      };
    });
  }, []);

  const closePreview = useCallback(() => setPreview(null), []);

  const openEditFromPreview = useCallback(() => {
    if (!previewEvent) return;
    setPreview(null);
    setEditor({ mode: 'edit', event: previewEvent });
  }, [previewEvent]);

  const closeEditor = useCallback(() => setEditor(null), []);

  const handleSave = useCallback(
    (input: CustomCalEventInput) => {
      if (!editor) return;
      if (editor.mode === 'new' && customEvents.length >= CUSTOM_CAL_EVENTS_MAX) {
        window.alert(t.calendar.customEventLimitReached(CUSTOM_CAL_EVENTS_MAX));
        return;
      }
      const saved = editor.mode === 'edit' ? updateEvent(editor.event.id, input) : addEvent(input);
      if (!saved) return;
      setEditor(null);
    },
    [editor, customEvents.length, addEvent, updateEvent, t],
  );

  const handleDeleteFromEditor = useCallback(() => {
    if (editor?.mode !== 'edit') return;
    const ok = window.confirm(t.calendar.customEventDeleteConfirm(editor.event.title));
    if (!ok) return;
    deleteEvent(editor.event.id);
    setEditor(null);
  }, [editor, deleteEvent, t]);

  const handleDeleteFromPreview = useCallback(() => {
    if (!previewEvent) return;
    const ok = window.confirm(t.calendar.customEventDeleteConfirm(previewEvent.title));
    if (!ok) return;
    deleteEvent(previewEvent.id);
    setPreview(null);
  }, [previewEvent, deleteEvent, t]);

  useEffect(() => {
    if (preview && !previewEvent) setPreview(null);
  }, [preview, previewEvent]);

  useEffect(() => {
    setPreview(null);
  }, [viewMode, weekParams?.start, weekParams?.end, bandCollapsed]);

  // 月表示の日セル内チップ／＋ からプレビュー・追加
  useEffect(() => {
    const body = calBodyRef.current;
    if (!body) return;
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const addBtn = target?.closest?.('[data-custom-day-add]') as HTMLElement | null;
      if (addBtn) {
        e.preventDefault();
        e.stopPropagation();
        const iso = addBtn.getAttribute('data-custom-day-add');
        if (!iso) return;
        const d = parseIsoLocal(iso);
        const weekday = (Number.isNaN(d.getTime()) ? 1 : d.getDay()) as CustomCalWeekday;
        setPreview(null);
        setEditor({ mode: 'new', presetIso: iso, presetWeekday: weekday });
        return;
      }
      const btn = target?.closest?.('[data-custom-event-id]') as HTMLElement | null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-custom-event-id');
      if (!id) return;
      const event = customEvents.find((ev) => ev.id === id);
      if (event) openPreview(event, btn);
    }
    body.addEventListener('click', onClick, true);
    return () => body.removeEventListener('click', onClick, true);
  }, [calBodyRef, customEvents, openPreview]);

  const switchModeClosingPreview = useCallback(
    (mode: 'week' | 'month') => {
      setPreview(null);
      switchMode(mode);
    },
    [switchMode],
  );

  return (
    <div className="p-panel-cal-wrap" hidden={!panelVisible}>
      <section
        className={`p-panel p-panel-cal${viewMode === 'month' ? ' is-month' : ''}`}
        data-cal-kind={calKind || undefined}
      >
        <CalendarShell
          viewMode={viewMode}
          modeTitle={modeTitle}
          modeGroupLabel={modeGroupLabel}
          rangeLabel={title}
          switchMode={switchModeClosingPreview}
          navigate={navigateSynced}
          calBodyRef={calBodyRef}
          navDisabled={toolbarLocked}
          controlsDisabled={toolbarLocked}
        />
        {bandRange ? (
          <CustomScheduleBand
            rangeStart={bandRange.start}
            rangeEnd={bandRange.end}
            weekStart={weekStart}
            events={customEvents}
            collapsed={bandCollapsed}
            onCollapsedChange={(next) => {
              setPreview(null);
              setBandCollapsed(next);
            }}
            swipeSignal={bandSwipeSignal}
            todayIso={props.demoTodayIso}
            onAdd={openNew}
            onSelect={openPreview}
          />
        ) : null}
      </section>
      {showSleepMascot ? (
        <img
          className="p-cal-kogi-sleep-mascot"
          src={kogiWeekSleepMascotUrl}
          alt=""
          decoding="async"
          aria-hidden
        />
      ) : null}
      <CustomEventOverlays
        preview={preview}
        previewEvent={previewEvent}
        editor={editor}
        weekStart={weekStart}
        onEdit={openEditFromPreview}
        onDeletePreview={handleDeleteFromPreview}
        onClosePreview={closePreview}
        onSave={handleSave}
        onDeleteEditor={handleDeleteFromEditor}
        onCloseEditor={closeEditor}
      />
    </div>
  );
}

export function CalendarPanel(props: CalendarPanelConfig) {
  return props.calKind === 'kogi' ? (
    <KogiCalendarPanel {...props} />
  ) : (
    <BasicCalendarPanel {...props} />
  );
}
