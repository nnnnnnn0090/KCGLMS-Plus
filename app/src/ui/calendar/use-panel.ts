/**
 * 公式カレンダーパネル（授業・補修・キャンパス）の表示とデータ取得を束ねるフックです。
 * `postMessage` の受信、バルク取得、グリッド HTML の更新、スワイプ演出までをまとめます。
 *
 * クロージャに古い props が閉じないよう `propsRef` を用い、
 * フェッチ状態など再レンダーを抑えたい値は `calRef` に集約します。
 *
 * ── calRef（ミュータブル）の役割と照合キー ─────────────────────────────
 * - `pendingKey` … `fetchRange` が投げた週／月の `pageFetch` とだけ照合する（`rangeKey(start,end)`）。
 * - `bulkPendingKey` … `queueBulkYearFetch` / `queueBulkExtend` の年レンジ専用。週の再取得とキーを分離し、
 *   設定の「週始まり」整列などで `fetchRange` が走ってもバルク完了判定が壊れないようにする。
 * - `loading` … 上記「直接フェッチ」が未完了。`navigate` は loading / bulkFetching / swipe 中はブロック。
 *   `fetchRange` は `bulkFetching` 中は開始しない（重なると loading が取り残されツールバーがロックしたままになる）。
 * - `bulkFetching` … 年バルクまたは延長フェッチ進行中。完了は `calendar-panel-process-inbound` の [1]。
 * - `clientDataMode` + `bulkItems` + `bulkParsed` … バルク済み。週送りは `navigateClientSide` + `applyCalSwipe`。
 * - `pendingExtend` … 境界で `queueBulkExtend` したあと、バルク応答で週／月 state を確定させるための保留。
 * - `lastItems` / `lastParsed` … 直近の描画入力（コース一覧更新時の再描画など）。
 *
 * ざっくりした遷移（正常系）:
 *   初回メッセージ → inbound [3] で描画 → `queueBulkYearFetch` → `bulkPendingKey` でバルク
 *   → inbound [1] で `clientDataMode` → 以降の週移動は `navigateClientSide`（スワイプ）。
 *   境界超えは `queueBulkExtend` → 応答 [1] で `pendingExtend` を state に反映。
 */

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import {
  sixWeekRange,
  isoToMonthRef,
  shiftMonthRef,
  type MonthRef,
  prevWeekRange,
  nextWeekRange,
  calendarYearRangeFromIso,
  calendarYearRangeBeforeInclusiveStart,
  filterCalItemsByRange,
  toIsoLocal,
  weekRangeContaining,
  calParamsAfterWeekStartChange,
  type CalendarWeekStart,
} from '../../lib/date';
import { pageFetch } from '../../lib/api';
import { clearRuntimeElementCss, setRuntimeElementCss } from '../../lib/runtime-element-style';
import { useSettings } from '../../context/settings';
import { buildCalendarGridHtml } from './grid';
import { usePortalMessage, type PortalCapturedMessage } from '../../hooks/usePortalMessage';
import { rangeKey } from './merge';
import { formatWeekTitle, formatMonthTitle } from './view-params';
import { clearCalBodyLoadingAttrs, applyCalSwipe, setCalBodyHtmlSmooth } from './anim';
import { runCalendarPanelInboundMessage } from './calendar-panel-process-inbound';
import type { CalParams, CalEvent, ViewMeta } from './types';
import { useI18n } from '../../i18n';

// ─── 設定インターフェース ──────────────────────────────────────────────────

export interface CalendarPanelConfig {
  /** カレンダー API URL ビルダー */
  calUrl: (p: CalParams) => string;
  /** カレンダー種別（kogi / hoshu / campus） */
  calKind: string;
  /** 週/月それぞれのパネルタイトル */
  titles: { week: string; month: string };
  /** 週/月切替ボタングループの aria-label */
  modeGroupLabel?: string;
  /** 受信する postMessage の type */
  msgType: string;
  /** true のとき、データがない場合パネルを隠す */
  hideWhenEmpty?: boolean;
  /** King LMS コース一覧（授業カレンダーでリンク解決に使う） */
  getKingLmsCourses?: () => Array<{ displayName?: string; externalAccessUrl?: string }>;
  /** コース一覧の内容が変わったとき再描画を促す値（変わると useEffect が走る） */
  kogiDisplayDeps?: string;
  /**
   * 授業カレンダー月表示の日セルへ差し込む追加予定。
   * 週表示では帯 UI 側のため未使用（渡しても mode=week ではマージしない）。
   */
  customCalEvents?: ViewMeta['customEvents'];
  /** true のとき、設定でオンなら授業カレンダーにマスコットを載せる（ホームの授業パネルのみ指定） */
  sleepMascotSlot?: boolean;
  /** プロモーション撮影用。指定時はAPIを使わず、このデータを表示する */
  demoItems?: CalEvent[];
  /** デモ表示上の今日 */
  demoTodayIso?: string;
}

// ─── フック ───────────────────────────────────────────────────────────────

export function useCalendarPanel({
  calUrl,
  calKind,
  titles,
  modeGroupLabel,
  msgType,
  hideWhenEmpty = false,
  getKingLmsCourses = () => [],
  kogiDisplayDeps,
  customCalEvents,
  demoItems,
  demoTodayIso,
}: CalendarPanelConfig) {
  const { settings, settingsReady } = useSettings();
  const { language, t } = useI18n();
  const weekStart = settings.calendarWeekStart;

  // ── 表示状態 ──────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [weekParams, setWeekParams] = useState<CalParams | null>(null);
  const [monthRef, setMonthRef] = useState<MonthRef | null>(null);
  const [gridHtml, setGridHtml] = useState('');
  const [panelVisible, setPanelVisible] = useState(!hideWhenEmpty);
  const [title, setTitle] = useState('');

  const calBodyRef = useRef<HTMLDivElement>(null);
  // アニメーション中は useLayoutEffect による DOM 更新をスキップする
  const skipDomSyncRef = useRef(false);
  const pendingEnterAnimRef = useRef(false);

  // ── props を ref で保持（コールバック内での古い値参照を防ぐ）──────────
  const propsRef = useRef({
    calUrl,
    calKind,
    hideWhenEmpty,
    getKingLmsCourses,
    msgType,
    demoItems,
    demoTodayIso,
    customCalEvents,
  });
  propsRef.current = {
    calUrl,
    calKind,
    hideWhenEmpty,
    getKingLmsCourses,
    msgType,
    demoItems,
    demoTodayIso,
    customCalEvents,
  };

  // ── 可変な表示パラメータを ref で保持（state と同期・上記モジュールコメント参照） ─
  const calRef = useRef({
    pendingKey: null as string | null,
    bulkPendingKey: null as string | null,
    loading: false,
    bulkFetching: false,
    bulkFetchKind: null as null | 'initial' | 'extend-next' | 'extend-prev',
    clientDataMode: false, // true = バルクデータ持ち（クライアントナビゲーション可）
    bulkItems: null as CalEvent[] | null, // 年単位で蓄積したデータ
    bulkParsed: null as { start: string; end: string } | null,
    pendingExtend: null as { weekParams?: CalParams; monthRef?: MonthRef } | null,
    pendingEnterAnim: false,
    swipeAnimating: false,
    lastItems: [] as CalEvent[],
    lastParsed: null as CalParams | null,
    storedUKbn: '1',
  });

  const weekParamsRef = useRef(weekParams);
  const monthRefRef = useRef(monthRef);
  const viewModeRef = useRef(viewMode);
  weekParamsRef.current = weekParams;
  monthRefRef.current = monthRef;
  viewModeRef.current = viewMode;
  const loadingWatchdogRef = useRef<number | null>(null);
  const bulkWatchdogRef = useRef<number | null>(null);

  const [toolbarLocked, setToolbarLocked] = useState(false);
  const syncToolbarLockedFromRef = useCallback(() => {
    const m = calRef.current;
    setToolbarLocked(Boolean(m.loading || m.bulkFetching || m.swipeAnimating));
  }, []);
  const clearLoadingWatchdog = useCallback(() => {
    if (loadingWatchdogRef.current !== null) {
      window.clearTimeout(loadingWatchdogRef.current);
      loadingWatchdogRef.current = null;
    }
  }, []);
  const clearBulkWatchdog = useCallback(() => {
    if (bulkWatchdogRef.current !== null) {
      window.clearTimeout(bulkWatchdogRef.current);
      bulkWatchdogRef.current = null;
    }
  }, []);

  // ── ビューメタ（描画時に使う設定まとめ） ────────────────────────────
  const viewMetaForRender = useCallback(
    (): ViewMeta => ({
      mode: viewModeRef.current,
      monthRef: viewModeRef.current === 'month' ? monthRefRef.current : null,
      kingLmsCourses: propsRef.current.getKingLmsCourses(),
      calKind: propsRef.current.calKind,
      weekStart,
      language,
      todayIso: propsRef.current.demoTodayIso,
      // 月表示の日セル用。週は帯のみなので mode 側で無視される
      customEvents: propsRef.current.customCalEvents,
    }),
    [weekStart, language],
  );

  // ── 現在表示している範囲の CalParams ─────────────────────────────────
  const visibleParsed = useCallback((): CalParams | null => {
    const m = calRef.current;
    const uK = m.storedUKbn || weekParamsRef.current?.uKbn;
    if (!uK) return null;
    if (viewModeRef.current === 'month' && monthRefRef.current) {
      const r = sixWeekRange(monthRefRef.current.y, monthRefRef.current.m, weekStart);
      return { uKbn: uK, ...r };
    }
    if (weekParamsRef.current) return { ...weekParamsRef.current, uKbn: uK };
    return null;
  }, [weekStart]);

  // ── パネル表示切替 ────────────────────────────────────────────────────
  const applyPanelVisibility = useCallback(
    (html: string, hasItems: boolean, opts?: { enterAnim?: boolean }) => {
      if (propsRef.current.hideWhenEmpty && !hasItems) {
        setPanelVisible(false);
        return;
      }
      setPanelVisible(true);
      pendingEnterAnimRef.current = opts?.enterAnim ?? false;
      setGridHtml(html);
    },
    [],
  );

  // ── クライアントサイド再描画（バルクデータ使用） ──────────────────────
  const redrawFromClient = useCallback(
    (opts?: { enterAnim?: boolean }) => {
      const m = calRef.current;
      if (!m.clientDataMode || !m.bulkParsed || m.bulkItems === null) return;
      const vp = visibleParsed();
      if (!vp?.start || !vp?.end) return;

      const filtered = filterCalItemsByRange(m.bulkItems, vp.start, vp.end);
      m.lastItems = filtered;
      m.lastParsed = vp;

      if (viewModeRef.current === 'week') setTitle(formatWeekTitle(vp.start, vp.end, language));
      else if (monthRefRef.current) setTitle(formatMonthTitle(monthRefRef.current, language));

      applyPanelVisibility(
        buildCalendarGridHtml(filtered, vp, viewMetaForRender()),
        filtered.length > 0,
        opts,
      );
    },
    [applyPanelVisibility, viewMetaForRender, visibleParsed, language],
  );

  // ── 通常の再描画（fetch レスポンス後） ───────────────────────────────
  const redraw = useCallback(
    (items: CalEvent[], parsed: CalParams, opts?: { enterAnim?: boolean }) => {
      const m = calRef.current;
      if (m.clientDataMode && m.bulkParsed) {
        redrawFromClient(opts);
        return;
      }

      if (viewModeRef.current === 'week')
        setTitle(formatWeekTitle(parsed.start, parsed.end, language));
      else if (monthRefRef.current) setTitle(formatMonthTitle(monthRefRef.current, language));

      applyPanelVisibility(
        buildCalendarGridHtml(items, parsed, viewMetaForRender()),
        items.length > 0,
        opts,
      );
    },
    [applyPanelVisibility, redrawFromClient, viewMetaForRender, language],
  );

  // ── バルク年取得の開始 ────────────────────────────────────────────────
  const queueBulkYearFetch = useCallback(() => {
    const m = calRef.current;
    const wp = weekParamsRef.current;
    if (m.bulkItems !== null || m.bulkFetching || m.clientDataMode) return;
    const uK = m.storedUKbn || wp?.uKbn;
    if (!uK || !wp || m.loading) return;

    m.bulkFetching = true;
    m.bulkFetchKind = 'initial';
    const yr = calendarYearRangeFromIso(wp.start);
    m.bulkPendingKey = rangeKey(yr.start, yr.end);
    pageFetch(propsRef.current.calUrl({ uKbn: uK, start: yr.start, end: yr.end }));
    clearBulkWatchdog();
    bulkWatchdogRef.current = window.setTimeout(() => {
      const mm = calRef.current;
      if (!mm.bulkFetching || mm.bulkPendingKey !== rangeKey(yr.start, yr.end)) return;
      mm.bulkFetching = false;
      mm.bulkPendingKey = null;
      mm.bulkFetchKind = null;
      mm.pendingExtend = null;
      syncToolbarLockedFromRef();
    }, 15000);
    syncToolbarLockedFromRef();
  }, [clearBulkWatchdog, syncToolbarLockedFromRef]);

  // ── ナビゲーション境界チェック（バルク範囲を超えるか） ────────────────
  const atNavBoundary = useCallback((dir: 'prev' | 'next'): boolean => {
    const m = calRef.current;
    if (!m.bulkParsed?.start || !m.bulkParsed?.end) return false;

    if (viewModeRef.current === 'week' && weekParamsRef.current) {
      const p =
        dir === 'prev'
          ? prevWeekRange(weekParamsRef.current)
          : nextWeekRange(weekParamsRef.current);
      return dir === 'prev' ? p.start < m.bulkParsed.start : p.end > m.bulkParsed.end;
    }

    if (viewModeRef.current === 'month' && monthRefRef.current) {
      const cand = shiftMonthRef(monthRefRef.current, dir === 'prev' ? -1 : 1);
      const candStart = `${cand.y}-${String(cand.m + 1).padStart(2, '0')}-01`;
      const nextMStart =
        cand.m === 11
          ? `${cand.y + 1}-01-01`
          : `${cand.y}-${String(cand.m + 2).padStart(2, '0')}-01`;
      return candStart < m.bulkParsed.start || nextMStart > m.bulkParsed.end;
    }
    return false;
  }, []);

  // ── バルク範囲の延長フェッチ ──────────────────────────────────────────
  const queueBulkExtend = useCallback(
    (dir: 'next' | 'prev') => {
      const m = calRef.current;
      if (m.bulkFetching || m.loading || m.swipeAnimating) return;
      const uK = m.storedUKbn || weekParamsRef.current?.uKbn;
      if (!uK || !m.bulkParsed) return;

      const yr =
        dir === 'next'
          ? calendarYearRangeFromIso(m.bulkParsed.end)
          : calendarYearRangeBeforeInclusiveStart(m.bulkParsed.start);

      m.bulkFetchKind = dir === 'next' ? 'extend-next' : 'extend-prev';

      if (viewModeRef.current === 'week' && weekParamsRef.current) {
        const np =
          dir === 'next'
            ? nextWeekRange(weekParamsRef.current)
            : prevWeekRange(weekParamsRef.current);
        m.pendingExtend = { weekParams: np, monthRef: isoToMonthRef(np.start) };
      } else if (viewModeRef.current === 'month' && monthRefRef.current) {
        m.pendingExtend = { monthRef: shiftMonthRef(monthRefRef.current, dir === 'next' ? 1 : -1) };
      } else {
        m.bulkFetchKind = null;
        return;
      }

      m.bulkFetching = true;
      m.bulkPendingKey = rangeKey(yr.start, yr.end);
      pageFetch(propsRef.current.calUrl({ uKbn: uK, start: yr.start, end: yr.end }));
      clearBulkWatchdog();
      bulkWatchdogRef.current = window.setTimeout(() => {
        const mm = calRef.current;
        if (!mm.bulkFetching || mm.bulkPendingKey !== rangeKey(yr.start, yr.end)) return;
        mm.bulkFetching = false;
        mm.bulkPendingKey = null;
        mm.bulkFetchKind = null;
        mm.pendingExtend = null;
        syncToolbarLockedFromRef();
      }, 15000);
      syncToolbarLockedFromRef();
    },
    [clearBulkWatchdog, syncToolbarLockedFromRef],
  );

  // ── postMessage ハンドラ（usePortalMessage と信頼条件を共有） ───────────
  const handleCapturedMessage = useCallback(
    (msg: PortalCapturedMessage) => {
      if (propsRef.current.demoItems) return;
      runCalendarPanelInboundMessage(msg as unknown as Record<string, unknown>, {
        msgType: propsRef.current.msgType,
        calRef,
        weekParamsRef,
        monthRefRef,
        viewModeRef,
        setWeekParams,
        setMonthRef,
        redrawFromClient,
        redraw,
        queueBulkYearFetch,
        weekStart,
        syncToolbarLocked: syncToolbarLockedFromRef,
      });
    },
    [queueBulkYearFetch, redraw, redrawFromClient, weekStart, syncToolbarLockedFromRef],
  );

  usePortalMessage(handleCapturedMessage, { msgTypes: [msgType] });

  useEffect(() => {
    if (!demoItems) return;
    const wr = calParamsAfterWeekStartChange(
      { ...weekRangeContaining(toIsoLocal(new Date()), weekStart), uKbn: '1' },
      weekStart,
      toIsoLocal(new Date()),
    );
    const mr = isoToMonthRef(wr.start);
    weekParamsRef.current = wr;
    monthRefRef.current = mr;
    setWeekParams(wr);
    setMonthRef(mr);

    const m = calRef.current;
    m.storedUKbn = '1';
    m.clientDataMode = true;
    m.bulkItems = demoItems;
    m.bulkParsed = { start: '2000-01-01', end: '2100-01-01' };
    m.lastItems = demoItems;
    m.lastParsed = wr;
    redrawFromClient({ enterAnim: true });
  }, [demoItems, redrawFromClient, weekStart]);

  // ── DOM 同期（gridHtml の変更を calBody に反映） ─────────────────────
  useLayoutEffect(() => {
    const el = calBodyRef.current;
    if (!el || !panelVisible || skipDomSyncRef.current) return;
    clearCalBodyLoadingAttrs(el);
    const playEnter = pendingEnterAnimRef.current;
    pendingEnterAnimRef.current = false;
    setCalBodyHtmlSmooth(el, gridHtml, undefined, { playEnterAnim: playEnter });
  }, [gridHtml, panelVisible]);

  // ── 直接フェッチ（月移動など） ────────────────────────────────────────
  const fetchRange = useCallback(
    (params: CalParams, opts?: { lockBodyHeight?: boolean }) => {
      const m = calRef.current;
      // 年バルク取得中に直接フェッチを重ねると、[1] が先に来ても loading が残りツールバーが永久ロックし得る
      // （週始まりを日曜にした直後の再整列 fetch がバルクと競合しやすい）
      if (m.loading || m.swipeAnimating || m.bulkFetching) return;
      const uKbn = params.uKbn || m.storedUKbn || weekParamsRef.current?.uKbn;
      if (!uKbn) return;
      m.pendingKey = rangeKey(params.start, params.end);
      m.loading = true;
      if (propsRef.current.hideWhenEmpty) setPanelVisible(true);
      const body = calBodyRef.current;
      if (body) {
        body.dataset.calLoading = '';
        body.dataset.calMode = viewModeRef.current;
        if (opts?.lockBodyHeight) {
          const h = Math.round(body.getBoundingClientRect().height);
          if (h > 64) setRuntimeElementCss(body, 'min-height', `min-height:${h}px`);
        } else {
          clearRuntimeElementCss(body, 'min-height');
        }
      }
      pendingEnterAnimRef.current = false;
      setGridHtml(`<p class="p-empty p-cal-loading-msg">${t.calendar.loading}</p>`);
      pageFetch(propsRef.current.calUrl({ uKbn, start: params.start, end: params.end }));
      clearLoadingWatchdog();
      const pendingKey = m.pendingKey;
      loadingWatchdogRef.current = window.setTimeout(() => {
        const mm = calRef.current;
        if (!mm.loading || mm.pendingKey !== pendingKey) return;
        mm.loading = false;
        mm.pendingKey = null;
        syncToolbarLockedFromRef();
      }, 15000);
      syncToolbarLockedFromRef();
    },
    [clearLoadingWatchdog, syncToolbarLockedFromRef, t],
  );

  // ── クライアントサイドナビゲーション ─────────────────────────────────
  const navigateClientSide = useCallback(
    (dir: 'prev' | 'next') => {
      const m = calRef.current;
      const vp0 = visibleParsed();
      if (!vp0) return;

      const oldItems = filterCalItemsByRange(m.bulkItems ?? [], vp0.start, vp0.end);
      const oldHtml = buildCalendarGridHtml(oldItems, vp0, viewMetaForRender());

      if (viewModeRef.current === 'week' && weekParamsRef.current) {
        const np =
          dir === 'prev'
            ? prevWeekRange(weekParamsRef.current)
            : nextWeekRange(weekParamsRef.current);
        setWeekParams(np);
        weekParamsRef.current = np;
        const mr = isoToMonthRef(np.start);
        setMonthRef(mr);
        monthRefRef.current = mr;
      } else if (viewModeRef.current === 'month' && monthRefRef.current) {
        const nr = shiftMonthRef(monthRefRef.current, dir === 'prev' ? -1 : 1);
        setMonthRef(nr);
        monthRefRef.current = nr;
      } else return;

      const vp1 = visibleParsed();
      if (!vp1) return;
      const newItems = filterCalItemsByRange(m.bulkItems ?? [], vp1.start, vp1.end);
      const newHtml = buildCalendarGridHtml(newItems, vp1, viewMetaForRender());

      m.lastItems = newItems;
      m.lastParsed = vp1;

      if (viewModeRef.current === 'week') setTitle(formatWeekTitle(vp1.start, vp1.end, language));
      else if (monthRefRef.current) setTitle(formatMonthTitle(monthRefRef.current, language));

      if (propsRef.current.hideWhenEmpty && newItems.length === 0) {
        setPanelVisible(false);
        return;
      }
      setPanelVisible(true);

      skipDomSyncRef.current = true;
      setGridHtml(newHtml);
      m.swipeAnimating = true;
      syncToolbarLockedFromRef();
      clearCalBodyLoadingAttrs(calBodyRef.current);
      applyCalSwipe(calBodyRef.current, dir, oldHtml, newHtml, () => {
        m.swipeAnimating = false;
        skipDomSyncRef.current = false;
        syncToolbarLockedFromRef();
      });
    },
    [viewMetaForRender, visibleParsed, syncToolbarLockedFromRef, language],
  );

  // ── 公開: ナビゲーション ─────────────────────────────────────────────
  const navigate = useCallback(
    (dir: 'prev' | 'next') => {
      const m = calRef.current;
      if (m.loading || m.bulkFetching || m.swipeAnimating) return;

      if (m.clientDataMode && m.bulkParsed) {
        // 境界に達したら次の年のデータを延長取得してから移動
        if (atNavBoundary(dir)) {
          queueBulkExtend(dir);
          return;
        }
        navigateClientSide(dir);
        return;
      }

      const uK = m.storedUKbn || weekParamsRef.current?.uKbn;
      if (viewModeRef.current === 'week' && weekParamsRef.current) {
        const np =
          dir === 'prev'
            ? prevWeekRange(weekParamsRef.current)
            : nextWeekRange(weekParamsRef.current);
        setWeekParams(np);
        weekParamsRef.current = np;
        fetchRange(np);
      } else if (viewModeRef.current === 'month' && monthRefRef.current && uK) {
        const nr = shiftMonthRef(monthRefRef.current, dir === 'prev' ? -1 : 1);
        setMonthRef(nr);
        monthRefRef.current = nr;
        fetchRange({ uKbn: uK, ...sixWeekRange(nr.y, nr.m, weekStart) });
      }
    },
    [atNavBoundary, fetchRange, navigateClientSide, queueBulkExtend, weekStart],
  );

  // ── 公開: モード切替 ─────────────────────────────────────────────────
  const switchMode = useCallback(
    (mode: 'week' | 'month') => {
      const m = calRef.current;
      if (m.loading || m.bulkFetching || m.swipeAnimating) return;
      if (mode === viewModeRef.current) return;

      const uK = m.storedUKbn || weekParamsRef.current?.uKbn;
      if (mode === 'month' && (!monthRefRef.current || !uK)) return;
      if (mode === 'week' && !weekParamsRef.current) return;

      setViewMode(mode);
      viewModeRef.current = mode;

      if (m.clientDataMode && m.bulkParsed) {
        if (mode === 'month' && !monthRefRef.current && weekParamsRef.current) {
          const nr = isoToMonthRef(weekParamsRef.current.start);
          setMonthRef(nr);
          monthRefRef.current = nr;
        }
        redrawFromClient({ enterAnim: true });
        return;
      }

      // フェッチ経由の場合、レスポンス受信後にフェードインが走るようフラグを立てる
      m.pendingEnterAnim = true;
      if (mode === 'month' && monthRefRef.current && uK) {
        fetchRange(
          { uKbn: uK, ...sixWeekRange(monthRefRef.current.y, monthRefRef.current.m, weekStart) },
          { lockBodyHeight: true },
        );
      } else if (mode === 'week' && weekParamsRef.current) {
        fetchRange(weekParamsRef.current, { lockBodyHeight: true });
      }
    },
    [fetchRange, redrawFromClient, weekStart],
  );

  /** ストレージ読込前は in-memory 既定の月曜扱い。初回 ready で保存値が日曜なら必ず再整列する */
  const prevCalendarWeekStartRef = useRef<CalendarWeekStart | null>(null);
  useEffect(() => {
    if (!settingsReady) return;
    if (prevCalendarWeekStartRef.current === null) {
      prevCalendarWeekStartRef.current = 'monday';
    }
    if (prevCalendarWeekStartRef.current === weekStart) return;
    prevCalendarWeekStartRef.current = weekStart;

    const m = calRef.current;
    const uK = m.storedUKbn || weekParamsRef.current?.uKbn;

    if (viewModeRef.current === 'week' && weekParamsRef.current) {
      const merged: CalParams = calParamsAfterWeekStartChange(
        weekParamsRef.current,
        weekStart,
        toIsoLocal(new Date()),
      );
      weekParamsRef.current = merged;
      setWeekParams(merged);
      const mr = isoToMonthRef(merged.start);
      monthRefRef.current = mr;
      setMonthRef(mr);

      if (m.clientDataMode && m.bulkParsed) redrawFromClient({ enterAnim: false });
      else if (uK) void fetchRange({ ...merged, uKbn: uK });
      return;
    }

    if (viewModeRef.current === 'month' && monthRefRef.current && uK) {
      if (m.clientDataMode && m.bulkParsed) redrawFromClient({ enterAnim: false });
      else
        void fetchRange({
          uKbn: uK,
          ...sixWeekRange(monthRefRef.current.y, monthRefRef.current.m, weekStart),
        });
    }
  }, [weekStart, settingsReady, redrawFromClient, fetchRange]);

  // ── 授業カレンダー: King LMS コース一覧の更新 → 再描画 ────────────────
  useEffect(() => {
    const m = calRef.current;
    if (!m.loading) clearLoadingWatchdog();
    if (!m.bulkFetching) clearBulkWatchdog();
  }, [gridHtml, clearBulkWatchdog, clearLoadingWatchdog]);

  useEffect(() => {
    if (kogiDisplayDeps === undefined) return;
    const m = calRef.current;
    if (m.lastParsed === null) return;
    if (m.clientDataMode && m.bulkParsed) redrawFromClient({ enterAnim: false });
    else redraw(m.lastItems, m.lastParsed, { enterAnim: false });
  }, [kogiDisplayDeps, redraw, redrawFromClient]);

  // ── 言語変更 → 固定文言を含むグリッドを再描画 ───────────────────────
  useEffect(() => {
    const m = calRef.current;
    if (m.clientDataMode && m.bulkParsed) redrawFromClient({ enterAnim: false });
    else if (m.lastParsed) redraw(m.lastItems, m.lastParsed, { enterAnim: false });
  }, [language, redraw, redrawFromClient]);

  useEffect(
    () => () => {
      clearLoadingWatchdog();
      clearBulkWatchdog();
    },
    [clearBulkWatchdog, clearLoadingWatchdog],
  );

  // ── 返却値 ───────────────────────────────────────────────────────────
  const modeTitle = viewMode === 'week' ? titles.week : titles.month;
  const resolvedModeGroupLabel = modeGroupLabel ?? t.calendar.modeGroup(modeTitle);

  return {
    calBodyRef,
    panelVisible,
    viewMode,
    calKind,
    modeTitle,
    modeGroupLabel: resolvedModeGroupLabel,
    title,
    switchMode,
    navigate,
    toolbarLocked,
    weekParams,
    weekStart,
  };
}
