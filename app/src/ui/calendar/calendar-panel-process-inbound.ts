/**
 * `useCalendarPanel` が受け取る `postMessage` の処理です。可変な `calRef` と React の `setState` を束ねます。
 * 受信分岐が肥大化しないよう、`use-panel` から切り出しています。
 *
 * 分岐の概要（`pendingKey`＝週／月の `fetchRange`、`bulkPendingKey`＝年バルク／延長のみ）:
 *  - [1] バルク完了 … `bulkPendingKey` と一致し `bulkFetching` 中ならマージして `clientDataMode` へ
 *  - [2] クライアントモード中の別レス … グリッドは触らず週／月パラメータだけ passive 更新
 *  - [2b] 期待した直接フェッチとキーが食い違う等 … [2] と同様の passive のみ（バルク応答は [1] へ任せる）
 *  - [3] 直接フェッチ完了 … `loading` かつ `pendingKey` 一致、またはリプレイ先行の「未依頼ペイント」
 *  - 上記以外 … 照合不能の遅延メッセージとして破棄
 */

import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  addDaysIso,
  weekRangeContaining,
  isoToMonthRef,
  type CalendarWeekStart,
  type MonthRef,
} from '../../lib/date';
import { parseCalendarRequest } from '../../lib/api';
import { mergeCalItemLists, rangeKey } from './merge';
import { storeFromParsed, storePassive } from './view-params';
import type { CalParams, CalEvent } from './types';

/** use-panel 内の calRef.current と同等のミュータブル塊 */
export interface CalendarPanelCalMutable {
  /** 週／月の直接 `pageFetch` と照合するキー（`fetchRange` など） */
  pendingKey: string | null;
  /** 年バルク／延長フェッチ専用。`pendingKey` と分離し、週の再取得と競合しないようにする */
  bulkPendingKey: string | null;
  loading: boolean;
  bulkFetching: boolean;
  bulkFetchKind: null | 'initial' | 'extend-next' | 'extend-prev';
  clientDataMode: boolean;
  bulkItems: CalEvent[] | null;
  bulkParsed: { start: string; end: string } | null;
  pendingExtend: null | { weekParams?: CalParams; monthRef?: MonthRef };
  pendingEnterAnim: boolean;
  swipeAnimating: boolean;
  lastItems: CalEvent[];
  lastParsed: CalParams | null;
  storedUKbn: string;
}

export interface CalendarPanelInboundContext {
  msgType: string;
  calRef: RefObject<CalendarPanelCalMutable>;
  weekParamsRef: RefObject<CalParams | null>;
  monthRefRef: RefObject<MonthRef | null>;
  viewModeRef: RefObject<'week' | 'month'>;
  setWeekParams: Dispatch<SetStateAction<CalParams | null>>;
  setMonthRef: Dispatch<SetStateAction<MonthRef | null>>;
  redrawFromClient: (opts?: { enterAnim?: boolean }) => void;
  redraw: (items: CalEvent[], parsed: CalParams, opts?: { enterAnim?: boolean }) => void;
  queueBulkYearFetch: () => void;
  /** 週の左端（サーバ返却の週境界をローカル表示に揃える） */
  weekStart: CalendarWeekStart;
  /** `loading` / `bulkFetching` / `swipeAnimating` 変更後にツールバー無効化を React へ同期する */
  syncToolbarLocked?: () => void;
}

/** [2] / [2b] 共通: グリッドは変えず週・月の参照だけポータル側に追随させる */
function applyPassiveWeekMonthFromMessage(
  ctx: CalendarPanelInboundContext,
  parsed: CalParams,
  isMonth: boolean,
): void {
  const m = ctx.calRef.current;
  m.storedUKbn = parsed.uKbn || m.storedUKbn;
  const hadWeekParams = ctx.weekParamsRef.current !== null;
  const passive = storePassive(parsed, isMonth, ctx.weekParamsRef.current, ctx.monthRefRef.current);
  let wp = passive.weekParams;
  let mr = passive.monthRef;
  if (wp && !isMonth && ctx.viewModeRef.current === 'week' && !hadWeekParams) {
    const n = weekRangeContaining(parsed.start, ctx.weekStart);
    wp = { uKbn: parsed.uKbn || n.uKbn, start: n.start, end: n.end };
    mr = isoToMonthRef(n.start);
  }
  if (wp && wp !== ctx.weekParamsRef.current) {
    ctx.setWeekParams(wp);
    ctx.weekParamsRef.current = wp;
  }
  if (mr && mr !== ctx.monthRefRef.current) {
    ctx.setMonthRef(mr);
    ctx.monthRefRef.current = mr;
  }
}

export function runCalendarPanelInboundMessage(
  d: Record<string, unknown>,
  ctx: CalendarPanelInboundContext,
): void {
  if (d.type !== ctx.msgType) return;
  if (!Array.isArray(d.items)) return;

  const parsed = d.requestUrl ? parseCalendarRequest(String(d.requestUrl)) : null;
  if (!parsed) return;

  const m = ctx.calRef.current;
  const key = rangeKey(parsed.start, parsed.end);
  const isMonth = parsed.end === addDaysIso(parsed.start, 42);
  const fetchMatches = m.pendingKey !== null && key === m.pendingKey;
  const bulkMatches = m.bulkPendingKey !== null && key === m.bulkPendingKey;

  // ── [1] バルクフェッチ完了 ────────────────────────────────────────────────
  // 年単位のデータを受け取り、extend か initial かに応じてマージし clientDataMode へ移行する。
  // pendingExtend がある場合は、あらかじめキューに積んでいた週/月移動をここで確定させる。
  if (bulkMatches && m.bulkFetching) {
    // 週の再取得と並走し得るため、`pendingKey` / `loading` は触らない（直接フェッチ側に任せる）
    m.bulkFetching = false;
    m.bulkPendingKey = null;
    const items = d.items as CalEvent[];
    const kind = m.bulkFetchKind;
    m.bulkFetchKind = null;

    if (kind === 'extend-next' && m.bulkParsed) {
      m.bulkItems = mergeCalItemLists(m.bulkItems ?? [], items);
      m.bulkParsed = { start: m.bulkParsed.start, end: parsed.end };
    } else if (kind === 'extend-prev' && m.bulkParsed) {
      m.bulkItems = mergeCalItemLists(items, m.bulkItems ?? []);
      m.bulkParsed = { start: parsed.start, end: m.bulkParsed.end };
    } else {
      m.bulkItems = items.length ? items : m.lastItems.length ? [...m.lastItems] : items;
      m.bulkParsed = parsed;
      m.clientDataMode = true;
    }

    if (m.pendingExtend) {
      if (m.pendingExtend.weekParams) {
        ctx.setWeekParams(m.pendingExtend.weekParams);
        ctx.weekParamsRef.current = m.pendingExtend.weekParams;
      }
      if (m.pendingExtend.monthRef) {
        ctx.setMonthRef(m.pendingExtend.monthRef);
        ctx.monthRefRef.current = m.pendingExtend.monthRef;
      }
      m.pendingExtend = null;
    }

    ctx.redrawFromClient({ enterAnim: false });
    ctx.syncToolbarLocked?.();
    return;
  }

  // ── [2] clientDataMode 中の非対象レスポンス ───────────────────────────────
  // バルクデータ保持中にポータルが自動フェッチしたレスポンスが流れ込む場合がある。
  // グリッドは再描画せず、最新の週/月パラメータのみ passive 更新する。
  if (m.clientDataMode && m.bulkParsed) {
    applyPassiveWeekMonthFromMessage(ctx, parsed, isMonth);
    return;
  }

  // ── [2b] 別の pendingKey に対するレスポンス、または古い loading 中レスポンス ─
  // ナビゲーション操作が重なった場合など、現在の pendingKey と一致しないレスポンスを
  // 受け取ることがある。グリッドは更新せず、パラメータの passive 更新だけ行う。
  // bulkPendingKey と一致する応答は [1] へ任せる（週キーと年キーが並走しても誤ってここに入れない）。
  if (!bulkMatches && ((m.pendingKey !== null && !fetchMatches) || (!m.pendingKey && m.loading))) {
    applyPassiveWeekMonthFromMessage(ctx, parsed, isMonth);
    return;
  }

  // ── [3] 通常フェッチ完了 ─────────────────────────────────────────────────
  // 週/月ナビゲーションによる直接フェッチのレスポンス。グリッドを即時再描画し、
  // バルクフェッチをキューに積んで次回のクライアントサイドナビゲーションに備える。
  // `pageFetch` より先に届くリプレイ等では loading / pendingKey が未設定のままのことがある。
  const unsolicitedPaint = !m.loading && !m.bulkFetching && m.pendingKey === null && !bulkMatches;
  if ((m.loading && fetchMatches) || unsolicitedPaint) {
    m.pendingKey = null;
    m.loading = false;
    m.storedUKbn = parsed.uKbn || m.storedUKbn;

    const sf = storeFromParsed(parsed, isMonth, ctx.weekParamsRef.current, ctx.monthRefRef.current);
    let weekParams = sf.weekParams;
    let monthRefNext = sf.monthRef;
    if (!isMonth && ctx.viewModeRef.current === 'week') {
      const n = weekRangeContaining(parsed.start, ctx.weekStart);
      weekParams = { uKbn: parsed.uKbn || n.uKbn, start: n.start, end: n.end };
      monthRefNext = monthRefNext ?? isoToMonthRef(n.start);
    }
    ctx.setWeekParams(weekParams);
    ctx.weekParamsRef.current = weekParams;
    ctx.setMonthRef(monthRefNext);
    ctx.monthRefRef.current = monthRefNext;

    const items = d.items as CalEvent[];

    // 週表示では URL の区間がポータル既定（月曜始まり）のまま返ることがある。
    // state 側では weekStart に揃えた weekParams を使うので、描画・lastParsed もそれに合わせる。
    const drawParsed: CalParams =
      !isMonth && ctx.viewModeRef.current === 'week' ? weekParams : parsed;

    m.lastItems = items;
    m.lastParsed = drawParsed;

    const enterAnim = m.pendingEnterAnim;
    m.pendingEnterAnim = false;
    ctx.redraw(items, drawParsed, { enterAnim });
    ctx.syncToolbarLocked?.();
    window.setTimeout(() => ctx.queueBulkYearFetch(), 0);
    return;
  }
}
