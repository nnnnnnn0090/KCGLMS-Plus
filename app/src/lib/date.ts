/**
 * 日付計算ユーティリティ（DOM に依存しない純粋関数）。
 * HTML テキスト抽出（plainFromHtml）は DOM 依存のため dom.ts に置く。
 */

// ─── ISO 日付 ←→ Date ────────────────────────────────────────────────────────

/** "YYYY-MM-DD" → ローカル 0 時 Date */
export function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date → "YYYY-MM-DD" */
export function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** ISO 日付に delta 日加算 */
export function addDaysIso(iso: string, delta: number): string {
  const d = parseIsoLocal(iso);
  d.setDate(d.getDate() + delta);
  return toIsoLocal(d);
}

/** [startIso, endIso) の日付列挙 */
export function enumerateRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = startIso;
  while (cur < endIso) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}

// ─── 週・月範囲 ───────────────────────────────────────────────────────────────

/** カレンダーグリッド左端の曜日 */
export type CalendarWeekStart = 'monday' | 'sunday';

/** storage 等の生値を正規化（不正値は月曜扱い） */
export function parseCalendarWeekStart(raw: unknown): CalendarWeekStart {
  return raw === 'sunday' ? 'sunday' : 'monday';
}

/** 指定日以前の最も近い月曜日（ローカル日付の暦日境界） */
function mondayOnOrBefore(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** 指定日以前の最も近い日曜日 */
function sundayOnOrBefore(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}

/** 週の左端（カレンダー列の最初の日）が weekStart と一致するよう、その日以前で直近の日を返す */
export function weekStartOnOrBefore(d: Date, weekStart: CalendarWeekStart): Date {
  return weekStart === 'sunday' ? sundayOnOrBefore(d) : mondayOnOrBefore(d);
}

/**
 * 指定ローカル日を含む週の [start, start+7)（半開区間）。
 * start は常に weekStart に整合した暦日。
 */
export function weekRangeContaining(
  iso: string,
  weekStart: CalendarWeekStart = 'monday',
): { uKbn: string; start: string; end: string } {
  const d = parseIsoLocal(iso);
  const strip = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const left = weekStartOnOrBefore(strip, weekStart);
  const start = toIsoLocal(left);
  return { uKbn: '0', start, end: addDaysIso(start, 7) };
}

/**
 * 週始まり（設定）変更時に、表示中の週レンジを新しい週境界へ載せ替えるためのアンカー日付。
 * 今日が表示週内なら今日、そうでなければ週の前半付近の代表日を使う。
 */
export function calendarRealignAnchorIso(
  todayIso: string,
  visibleRange: { start: string; end: string },
): string {
  if (todayIso >= visibleRange.start && todayIso < visibleRange.end) return todayIso;
  return addDaysIso(visibleRange.start, 3);
}

/**
 * 表示中の週パラメータと新しい週始まり設定から、API 用の週範囲を組み直す（uKbn は既存を優先）。
 */
export function calParamsAfterWeekStartChange(
  current: { uKbn: string; start: string; end: string },
  nextWeekStart: CalendarWeekStart,
  todayIso: string,
): { uKbn: string; start: string; end: string } {
  const anchor = calendarRealignAnchorIso(todayIso, current);
  const wr = weekRangeContaining(anchor, nextWeekStart);
  return {
    uKbn: current.uKbn || wr.uKbn,
    start: wr.start,
    end: wr.end,
  };
}

/** 指定年月の月カレンダーを 6 週分で表示する範囲（週の左端は weekStart） */
export function sixWeekRange(
  year: number,
  monthIndex: number,
  weekStart: CalendarWeekStart = 'monday',
): { start: string; end: string } {
  const start = weekStartOnOrBefore(new Date(year, monthIndex, 1), weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 42);
  return { start: toIsoLocal(start), end: toIsoLocal(end) };
}

// ─── MonthRef ─────────────────────────────────────────────────────────────────

export interface MonthRef {
  y: number;
  m: number;
}

export function isoToMonthRef(iso: string): MonthRef {
  const d = parseIsoLocal(iso);
  return { y: d.getFullYear(), m: d.getMonth() };
}

export function shiftMonthRef(ref: MonthRef, delta: number): MonthRef {
  let { y, m } = ref;
  m += delta;
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  while (m > 11) {
    m -= 12;
    y += 1;
  }
  return { y, m };
}

// ─── カレンダー年範囲 ─────────────────────────────────────────────────────────

/** 指定日を含む年の [Jan 1, Jan 1 翌年) 範囲 */
export function calendarYearRangeFromIso(iso: string): { start: string; end: string } {
  const y = parseIsoLocal(iso).getFullYear();
  return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
}

/** 指定日の 1 年前の年範囲 */
export function calendarYearRangeBeforeInclusiveStart(startInclusive: string): {
  start: string;
  end: string;
} {
  const y = parseIsoLocal(startInclusive).getFullYear() - 1;
  return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
}

// ─── カレンダーイベント日付 ───────────────────────────────────────────────────

/** イベントの start フィールドから "YYYY-MM-DD" を取り出す */
export function calEventDayIso(ev: { start?: unknown }): string {
  const raw = ev?.start;
  if (raw == null || raw === '') return '';
  const m = String(raw)
    .trim()
    .match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
}

/** start フィールドで範囲フィルタリング */
export function filterCalItemsByRange<T extends { start?: unknown }>(
  items: T[],
  startIso: string,
  endIsoExclusive: string,
): T[] {
  return (Array.isArray(items) ? items : []).filter((ev) => {
    const day = calEventDayIso(ev);
    return day && day >= startIso && day < endIsoExclusive;
  });
}

// ─── 週ナビゲーション ─────────────────────────────────────────────────────────

export function prevWeekRange(p: { uKbn: string; start: string; end: string }) {
  return { uKbn: p.uKbn, start: addDaysIso(p.start, -7), end: p.start };
}

export function nextWeekRange(p: { uKbn: string; start: string; end: string }) {
  return { uKbn: p.uKbn, start: p.end, end: addDaysIso(p.end, 7) };
}

// ─── 学年度 ───────────────────────────────────────────────────────────────────

/** 現在の学年度（4 月〜翌 3 月） */
export function currentNendo(): number {
  const now = new Date();
  const m = now.getMonth() + 1;
  return m >= 4 ? now.getFullYear() : now.getFullYear() - 1;
}
