/**
 * 授業カレンダーの「第 n 回」を数える純関数群です。
 *
 * 学年度（4/1〜翌 3/31）分の KogiCalendar を集め、同じ講義（講義コード、無ければ授業名）が
 * その日までに何日目の授業かを数えます。同じ日に連続するコマ（例: 3・4 限）は 1 回として数えます。
 */

import { addDaysIso, calEventDayIso, parseIsoLocal } from '../../lib/date';
import { kogiLectureCode, parseLeadingPeriodTitle } from './kogi';
import type { CalEvent } from './types';

/** 学年度の開始年（1〜3 月は前年度扱い） */
export function academicYearOf(iso: string): number {
  const d = parseIsoLocal(iso);
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

/** 学年度の半開区間 [YYYY-04-01, YYYY+1-04-01) */
export function academicYearRange(year: number): { start: string; end: string } {
  return { start: `${year}-04-01`, end: `${year + 1}-04-01` };
}

/** 区間が学年度 1 年分ちょうどなら、その開始年を返す */
export function academicYearFromRange(start: string, end: string): number | null {
  const m = /^(\d{4})-04-01$/.exec(String(start ?? ''));
  if (!m) return null;
  const y = Number(m[1]);
  return end === `${y + 1}-04-01` ? y : null;
}

/** 講義を識別するキー。講義コードを優先し、無ければ時限番号を除いた授業名を使う */
export function kogiCourseKey(ev: Pick<CalEvent, 'tooltip' | 'title'>): string {
  // 「コード：」ラベル付きのときだけ講義コードを使う（3 行目フォールバックは別の情報を拾い得るため使わない）
  const code = kogiLectureCode(String(ev.tooltip ?? ''), '');
  if (code) return `c:${code}`;
  const { rest } = parseLeadingPeriodTitle(ev.title ?? '');
  return rest ? `t:${rest}` : '';
}

function sessionKey(courseKey: string, dayIso: string): string {
  return `${courseKey}\0${dayIso}`;
}

/** 学年度分のイベントから「講義キー + 日付 → 第 n 回」の対応表を作る */
export function buildKogiSessionIndex(items: readonly CalEvent[]): Map<string, number> {
  const daysByCourse = new Map<string, Set<string>>();
  for (const ev of items) {
    const day = calEventDayIso(ev);
    const key = kogiCourseKey(ev);
    if (!day || !key) continue;
    let days = daysByCourse.get(key);
    if (!days) daysByCourse.set(key, (days = new Set()));
    days.add(day);
  }
  const index = new Map<string, number>();
  for (const [key, days] of daysByCourse) {
    [...days].sort().forEach((day, i) => index.set(sessionKey(key, day), i + 1));
  }
  return index;
}

/** 対応表からイベントの回数を引く。分からなければ null */
export function lookupKogiSession(
  index: ReadonlyMap<string, number> | undefined,
  ev: Pick<CalEvent, 'tooltip' | 'title' | 'start'>,
): number | null {
  if (!index || index.size === 0) return null;
  const day = calEventDayIso(ev);
  const key = kogiCourseKey(ev);
  if (!day || !key) return null;
  return index.get(sessionKey(key, day)) ?? null;
}

/** 表示範囲 [start, end) が掛かる学年度の開始年（週が 3/31 と 4/1 をまたぐと 2 つ） */
export function academicYearsForRange(start: string, end: string): number[] {
  const years = new Set([academicYearOf(start), academicYearOf(addDaysIso(end, -1))]);
  return [...years];
}
