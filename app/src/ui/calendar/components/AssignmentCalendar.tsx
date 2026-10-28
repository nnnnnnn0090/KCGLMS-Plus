/**
 * 拡張ストレージに保存された King LMS 課題をカレンダー表示するパネルです。
 * データが無い場合も枠と「最新の状態に更新」導線は常に表示します（`hideWhenEmpty` は行いません）。
 */

import { useState, useLayoutEffect, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  toIsoLocal,
  sixWeekRange,
  isoToMonthRef,
  shiftMonthRef,
  prevWeekRange,
  nextWeekRange,
  filterCalItemsByRange,
  calendarRealignAnchorIso,
} from '../../../lib/date';
import { clearRuntimeElementCss, setRuntimeElementCss } from '../../../lib/runtime-element-style';
import { useSettings } from '../../../context/settings';
import { buildCalendarGridHtml } from '../grid';
import { SK, KING_LMS_ASSIGNMENT_SYNC_URL } from '../../../shared/constants';
import { canonicalPortalHref } from '../../../domain/portal/portal-location-url';
import storage from '../../../lib/storage';
import {
  clearCalBodyLoadingAttrs,
  applyCalSwipe,
  setCalBodyHtmlSmooth,
  prefersReducedMotion,
} from '../anim';
import {
  assignmentViewMeta,
  dueItemsToCalEvents,
  formatKingLmsCapturedAgo,
  weekRangeContaining,
  type DuePayload,
} from '../assignment';
import { CalendarShell } from './CalendarShell';
import { useI18n } from '../../../i18n';

// ─── 型 ───────────────────────────────────────────────────────────────────

interface AssignmentCalendarProps {
  payload: DuePayload | null;
  titles: { week: string; month: string };
  demoTodayIso?: string;
}

// ─── コンポーネント ────────────────────────────────────────────────────────

export function AssignmentCalendar({ payload, titles, demoTodayIso }: AssignmentCalendarProps) {
  const todayIso = demoTodayIso ?? toIsoLocal(new Date());
  const demoNowMs = demoTodayIso ? Date.parse(`${demoTodayIso}T12:00:00+09:00`) : undefined;
  const { settings, settingsReady } = useSettings();
  const { language, t } = useI18n();
  const weekStart = settings.calendarWeekStart;
  const events = useMemo(
    () => dueItemsToCalEvents(payload?.items ?? [], language),
    [payload?.items, language],
  );
  const hasData = events.length > 0;

  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [weekParams, setWeekParams] = useState(() => weekRangeContaining(todayIso));
  const [monthRef, setMonthRef] = useState(() => isoToMonthRef(todayIso));
  const [swipeAnimating, setSwipeAnimating] = useState(false);
  /** King LMS 同期ページへ遷移する直前の storage 書き込み中 */
  const [refreshNavigating, setRefreshNavigating] = useState(false);

  const calBodyRef = useRef<HTMLDivElement>(null);
  /** 取得時刻の「◯秒前」を1秒ごとに更新 */
  const [capturedNowMs, setCapturedNowMs] = useState(() => Date.now());
  // スワイプ中は useLayoutEffect による DOM 更新をスキップする
  const skipDomSyncRef = useRef(false);
  /** 週/月切替直後の1回だけグリッドにフェードイン（授業カレンダーと同じ playCalModeEnterAnim） */
  const pendingModeEnterAnimRef = useRef(false);

  const weekParamsRef = useRef(weekParams);
  weekParamsRef.current = weekParams;
  const prevWeekStartRef = useRef<typeof weekStart | null>(null);

  useEffect(() => {
    if (!settingsReady) return;
    const today = todayIso;
    const wp = weekParamsRef.current;

    if (prevWeekStartRef.current === null) {
      prevWeekStartRef.current = weekStart;
      const wr = weekRangeContaining(today, weekStart);
      setWeekParams(wr);
      setMonthRef(isoToMonthRef(wr.start));
      return;
    }
    if (prevWeekStartRef.current === weekStart) return;
    prevWeekStartRef.current = weekStart;

    const anchor = calendarRealignAnchorIso(today, wp);
    const wr = weekRangeContaining(anchor, weekStart);
    setWeekParams(wr);
    setMonthRef(isoToMonthRef(wr.start));
  }, [settingsReady, weekStart, todayIso]);

  // ── 現在表示範囲の HTML を生成する ────────────────────────────────────
  const gridHtml = useMemo(() => {
    if (!hasData) return '';
    const r =
      viewMode === 'month'
        ? sixWeekRange(monthRef.y, monthRef.m, weekStart)
        : { start: weekParams.start, end: weekParams.end };
    return buildCalendarGridHtml(filterCalItemsByRange(events, r.start, r.end), r, {
      mode: viewMode,
      monthRef: viewMode === 'month' ? monthRef : null,
      ...assignmentViewMeta,
      weekStart,
      language,
      todayIso: demoTodayIso,
      nowMs: demoNowMs,
    });
  }, [
    hasData,
    events,
    viewMode,
    monthRef,
    weekParams,
    weekStart,
    language,
    demoTodayIso,
    demoNowMs,
  ]);

  // ── グリッド HTML を DOM に反映（スワイプ中は skip） ──────────────────
  useLayoutEffect(() => {
    if (!hasData) return;
    const el = calBodyRef.current;
    if (!el || skipDomSyncRef.current) return;
    clearCalBodyLoadingAttrs(el);
    const playEnter = pendingModeEnterAnimRef.current;
    pendingModeEnterAnimRef.current = false;
    setCalBodyHtmlSmooth(el, gridHtml, undefined, { playEnterAnim: playEnter });
  }, [gridHtml, hasData]);

  // ── 保存データ取得時刻の相対表示をリアルタイム更新 ─────────────────────
  useEffect(() => {
    if (!hasData) return;
    if (payload?.capturedAt == null || !Number.isFinite(payload.capturedAt)) return;
    setCapturedNowMs(Date.now());
    const id = window.setInterval(() => setCapturedNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasData, payload?.capturedAt]);

  // ── King LMS 課題データの再取得（同期ページへ遷移）──────────────────
  async function handleRefresh() {
    if (refreshNavigating) return;
    setRefreshNavigating(true);
    try {
      await storage.set({
        [SK.kingLmsAssignmentSyncPending]: true,
        [SK.kingLmsAssignmentSyncReturnUrl]: canonicalPortalHref(),
      });
      window.location.href = KING_LMS_ASSIGNMENT_SYNC_URL;
    } catch {
      setRefreshNavigating(false);
    }
  }

  // ── 前/次 ナビゲーション ─────────────────────────────────────────────
  const navigate = useCallback(
    (dir: 'prev' | 'next') => {
      if (swipeAnimating || !hasData) return;
      const el = calBodyRef.current;
      if (!el) return;

      // 現在の HTML（スワイプアウト用）
      const r0 =
        viewMode === 'month'
          ? sixWeekRange(monthRef.y, monthRef.m, weekStart)
          : { start: weekParams.start, end: weekParams.end };
      const oldHtml = buildCalendarGridHtml(filterCalItemsByRange(events, r0.start, r0.end), r0, {
        mode: viewMode,
        monthRef: viewMode === 'month' ? monthRef : null,
        ...assignmentViewMeta,
        weekStart,
        language,
        todayIso: demoTodayIso,
        nowMs: demoNowMs,
      });

      // 次の表示範囲を計算してステートを更新
      let nextWp = weekParams;
      let nextMr: typeof monthRef;
      if (viewMode === 'week') {
        nextWp = dir === 'prev' ? prevWeekRange(weekParams) : nextWeekRange(weekParams);
        nextMr = isoToMonthRef(nextWp.start);
        setWeekParams(nextWp);
        setMonthRef(nextMr);
      } else {
        nextMr = shiftMonthRef(monthRef, dir === 'prev' ? -1 : 1);
        setMonthRef(nextMr);
      }

      // 次の HTML（スワイプイン用）
      const r1 =
        viewMode === 'month'
          ? sixWeekRange(nextMr.y, nextMr.m, weekStart)
          : { start: nextWp.start, end: nextWp.end };
      const newHtml = buildCalendarGridHtml(filterCalItemsByRange(events, r1.start, r1.end), r1, {
        mode: viewMode,
        monthRef: viewMode === 'month' ? nextMr : null,
        ...assignmentViewMeta,
        weekStart,
        language,
        todayIso: demoTodayIso,
        nowMs: demoNowMs,
      });

      if (prefersReducedMotion()) {
        clearCalBodyLoadingAttrs(el);
        return;
      }

      skipDomSyncRef.current = true;
      setSwipeAnimating(true);
      clearCalBodyLoadingAttrs(el);
      applyCalSwipe(el, dir, oldHtml, newHtml, () => {
        setSwipeAnimating(false);
        skipDomSyncRef.current = false;
      });
    },
    [
      swipeAnimating,
      hasData,
      viewMode,
      weekParams,
      monthRef,
      events,
      weekStart,
      language,
      demoTodayIso,
      demoNowMs,
    ],
  );

  // ── 週/月 モード切替 ─────────────────────────────────────────────────
  function switchMode(mode: 'week' | 'month') {
    if (!hasData || mode === viewMode || swipeAnimating) return;
    pendingModeEnterAnimRef.current = true;
    setViewMode(mode);
    const el = calBodyRef.current;
    if (el) {
      el.dataset.calMode = mode;
      // モード切替前の高さを保持してレイアウトシフトを緩和する
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 64) setRuntimeElementCss(el, 'min-height', `min-height:${h}px`);
      requestAnimationFrame(() => {
        clearRuntimeElementCss(el, 'min-height');
      });
    }
  }

  // ── ラベル ────────────────────────────────────────────────────────────
  const rangeLabel =
    viewMode === 'week'
      ? `${weekParams.start.replace(/-/g, '/')} 〜 ${weekParams.end.replace(/-/g, '/')}`
      : t.calendar.monthTitle(monthRef.y, monthRef.m + 1);

  const capturedAgo = useMemo(() => {
    if (payload?.capturedAt == null || !Number.isFinite(payload.capturedAt)) return null;
    return formatKingLmsCapturedAgo(payload.capturedAt, language, capturedNowMs);
  }, [payload?.capturedAt, capturedNowMs, language]);

  return (
    <section
      id="p-assignment-calendar-panel"
      className={`p-panel p-panel-cal p-panel-cal-assignment${viewMode === 'month' ? ' is-month' : ''}`}
      data-cal-kind="assignment"
    >
      {/* ヘッダー行：タイトル + 再取得ボタン */}
      <div className="p-assignment-head-row">
        <span className="p-panel-head">{t.home.assignmentCalendar}</span>
        <button
          type="button"
          id="p-assignment-refresh-btn"
          className={`p-settings-resync-btn${refreshNavigating ? ' is-busy' : ''}`}
          disabled={refreshNavigating}
          aria-busy={refreshNavigating}
          aria-label={
            refreshNavigating
              ? t.calendar.assignmentRefreshBusyAria
              : t.calendar.assignmentRefreshAria
          }
          onClick={() => void handleRefresh()}
        >
          {refreshNavigating ? (
            <>
              <span className="p-assignment-refresh-spinner" aria-hidden />
              <span className="p-assignment-refresh-label">{t.calendar.assignmentPreparing}</span>
            </>
          ) : (
            <span className="p-assignment-refresh-label">{t.calendar.assignmentRefresh}</span>
          )}
        </button>
      </div>

      {refreshNavigating ? (
        <div className="p-assignment-refresh-status" role="status" aria-live="polite">
          <span className="p-assignment-refresh-status__spinner" aria-hidden />
          <div className="p-assignment-refresh-status__copy">
            <p className="p-assignment-refresh-status__lead">
              {t.calendar.assignmentRefreshLead.split('King LMS')[0]}
              <strong>King LMS</strong>
              {t.calendar.assignmentRefreshLead.split('King LMS')[1] ?? ''}
            </p>
            <p className="p-assignment-refresh-status__hint">{t.calendar.assignmentRefreshHint}</p>
          </div>
        </div>
      ) : null}

      {/* データ未取得メッセージ */}
      <div className="p-panel-body p-assignment-fetch-wrap" hidden={hasData}>
        <p className="p-empty">{t.calendar.assignmentNoData}</p>
      </div>

      {/* キャッシュ注意＋提出状況（Beta）の注記 */}
      <div className="p-assignment-cache-note" hidden={!hasData} role="note">
        <p>{t.calendar.assignmentCacheNote(capturedAgo)}</p>
        <p className="p-assignment-cache-note__beta">{t.calendar.assignmentBetaNote}</p>
      </div>

      <CalendarShell
        viewMode={viewMode}
        modeTitle={viewMode === 'week' ? titles.week : titles.month}
        modeGroupLabel={t.calendar.modeGroup(t.home.assignmentCalendar)}
        rangeLabel={rangeLabel}
        switchMode={switchMode}
        navigate={navigate}
        calBodyRef={calBodyRef}
        bodyHidden={!hasData}
        navDisabled={!hasData || swipeAnimating}
        controlsDisabled={!hasData || swipeAnimating}
      />
    </section>
  );
}
