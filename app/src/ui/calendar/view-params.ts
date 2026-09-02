/**
 * 週表示・月表示のパラメータを、API レスポンスから確定する純関数群です。
 */

import { addDaysIso, parseIsoLocal, isoToMonthRef, type MonthRef } from '../../lib/date';
import type { CalParams } from './types';
import { messagesForLanguage, type AppLanguage } from '../../i18n/messages';

// ─── ラベル生成 ───────────────────────────────────────────────────────────

function isoToLabel(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[1]}/${+m[2]}/${+m[3]}`;
}

export function formatWeekTitle(start: string, end: string, language: AppLanguage = 'ja'): string {
  const t = messagesForLanguage(language).calendar;
  return t.weekRange(isoToLabel(start), isoToLabel(addDaysIso(end, -1)));
}

export function formatMonthTitle(ref: MonthRef, language: AppLanguage = 'ja'): string {
  return messagesForLanguage(language).calendar.monthTitle(ref.y, ref.m + 1);
}

// ─── 表示パラメータの確定 ─────────────────────────────────────────────────

/**
 * 受信したカレンダーレスポンスから週/月パラメータを確定する（旧 storeFromParsed）。
 * 月ビュー用レスポンスと週ビュー用レスポンスで処理が異なる。
 */
export function storeFromParsed(
  parsed: CalParams,
  isMonth: boolean,
  weekParams: CalParams | null,
  monthRef: MonthRef | null,
): { weekParams: CalParams; monthRef: MonthRef } {
  if (isMonth) {
    // 月ビュー API は 6 週分（42 日）のレスポンスを返す。
    // 先頭週が前月にまたがる場合でも正しい月を得るため、
    // 中央日（21 日目 = 第 4 週月曜付近）から月参照を求める。
    const midDate = parseIsoLocal(addDaysIso(parsed.start, 21));
    const mid: MonthRef = { y: midDate.getFullYear(), m: midDate.getMonth() };
    const wp = weekParams ?? {
      uKbn: parsed.uKbn,
      start: parsed.start,
      end: addDaysIso(parsed.start, 7),
    };
    return { weekParams: wp, monthRef: monthRef ?? mid };
  }
  return { weekParams: parsed, monthRef: monthRef ?? isoToMonthRef(parsed.start) };
}

/**
 * 表示対象外レスポンス受信時の補助保存。
 * weekParams / monthRef が未確定のとき初期値として使う。
 * カレンダーパネルが複数ある場合、自パネル以外のレスポンスでもパラメータを補完できる。
 */
export function storePassive(
  parsed: CalParams,
  isMonth: boolean,
  weekParams: CalParams | null,
  monthRef: MonthRef | null,
): { weekParams: CalParams | null; monthRef: MonthRef | null } {
  if (isMonth) {
    const midDate = parseIsoLocal(addDaysIso(parsed.start, 21));
    const mid: MonthRef = monthRef ?? { y: midDate.getFullYear(), m: midDate.getMonth() };
    const wp = weekParams ?? {
      uKbn: parsed.uKbn,
      start: parsed.start,
      end: addDaysIso(parsed.start, 7),
    };
    return { weekParams: wp, monthRef: mid };
  }
  if (weekParams === null) {
    return { weekParams: parsed, monthRef: monthRef ?? isoToMonthRef(parsed.start) };
  }
  return { weekParams, monthRef };
}
