/**
 * King LMS の calendarItems 由来データを、カレンダー描画用の `CalEvent` へ変換するアダプタです。
 */

import { isoToMonthRef, calEventDayIso } from '../../lib/date';
import { KING_LMS_ORIGIN } from '../../shared/constants';
import type { CalEvent } from './types';
import { localeForLanguage, messagesForLanguage, type AppLanguage } from '../../i18n/messages';

// ─── 型 ───────────────────────────────────────────────────────────────────

export interface DueItem {
  /** コース ID（数値または文字列）。URL 組み立てに使用 */
  courseId?: string | number;
  courseName?: string;
  title?: string;
  dueDate?: string;
  /** calendarItems.itemSourceId（同一課題のマージに使用） */
  sourceId?: string;
  /** gradebook user status から取得。true=提出済み, false=未提出 */
  submitted?: boolean;
}

export interface DuePayload {
  items: DueItem[];
  capturedAt: number;
}

/** 課題カレンダーの描画オプション（授業カレンダー用のコース一覧は使わない） */
export const assignmentViewMeta = {
  kingLmsCourses: [] as Array<{ displayName?: string; externalAccessUrl?: string }>,
  calKind: 'assignment' as const,
};

// ─── ヘルパー ─────────────────────────────────────────────────────────────

function assignmentMergeKey(row: DueItem): string | null {
  const cid = String(row.courseId ?? '').trim();
  const sid = String(row.sourceId ?? '').trim();
  const due = String(row.dueDate ?? '').trim();
  if (!cid || !sid || !due) return null;
  return `${cid}\0${sid}\0${due}`;
}

function assignmentDisplayKey(row: DueItem): string {
  const start = String(row.dueDate ?? '').trim();
  const title = String(row.title ?? '').trim() || '__untitled__';
  const cid = String(row.courseId ?? '').trim();
  const dk = calEventDayIso({ start });
  return `${dk}\0${start}\0${title}\0${cid}`;
}

function pickRepresentative(rows: DueItem[], locale: string): DueItem {
  const withStatus = rows.find((r) => typeof r.submitted === 'boolean');
  if (withStatus) return withStatus;
  return [...rows].sort((a, b) =>
    String(a.title ?? '').localeCompare(String(b.title ?? ''), locale),
  )[0]!;
}

export type AssignmentDisplayStatus = 'submitted' | 'pending' | 'overdue' | 'unknown';

/** 課題セルのバッジ用: 提出済み / 未提出 / 期限切れ（未提出かつ締切超過） */
export function resolveAssignmentDisplayStatus(
  submitted: boolean | undefined,
  dueIso: string | undefined,
  nowMs = Date.now(),
): AssignmentDisplayStatus {
  if (submitted === true) return 'submitted';
  if (submitted === false) {
    const dueMs = dueIso ? Date.parse(dueIso) : Number.NaN;
    if (!Number.isNaN(dueMs) && dueMs < nowMs) return 'overdue';
    return 'pending';
  }
  return 'unknown';
}

export function assignmentStatusLabel(
  status: AssignmentDisplayStatus,
  language: AppLanguage = 'ja',
): string {
  const t = messagesForLanguage(language).calendar;
  switch (status) {
    case 'submitted':
      return t.submitted;
    case 'pending':
      return t.pending;
    case 'overdue':
      return t.overdue;
    default:
      return '';
  }
}

export { weekRangeContaining } from '../../lib/date';
export type { CalendarWeekStart } from '../../lib/date';

/**
 * 保存データの取得時刻（ミリ秒 epoch）から、注意書き用の相対表現を返す（秒まで表示）。
 */
export function formatKingLmsCapturedAgo(
  capturedAtMs: number,
  language: AppLanguage = 'ja',
  nowMs = Date.now(),
): string {
  const t = messagesForLanguage(language).calendar;
  const diff = Math.max(0, nowMs - capturedAtMs);
  const totalSec = Math.floor(diff / 1000);
  if (totalSec < 1) return t.justNow;
  if (totalSec < 60) return t.secondsAgo(totalSec);

  if (totalSec < 3600) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return t.minutesSecondsAgo(m, s);
  }

  if (totalSec < 86400) {
    const h = Math.floor(totalSec / 3600);
    const r = totalSec % 3600;
    const m = Math.floor(r / 60);
    const s = r % 60;
    return t.hoursMinutesSecondsAgo(h, m, s);
  }

  const days = Math.floor(totalSec / 86400);
  if (days < 30) {
    const r1 = totalSec % 86400;
    const h = Math.floor(r1 / 3600);
    const r2 = r1 % 3600;
    const m = Math.floor(r2 / 60);
    const s = r2 % 60;
    return t.daysHoursMinutesSecondsAgo(days, h, m, s);
  }

  const months = Math.floor(days / 30);
  if (months < 12) return t.monthsAgo(months);
  return t.yearsAgo(Math.floor(days / 365));
}

/** 期限日時を日本語形式にフォーマット */
export function formatDueLabel(iso: string, language: AppLanguage = 'ja'): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(localeForLanguage(language), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(iso);
  }
}

/**
 * 課題ツールチップ用: 締切まで（または超過後）の残り時間を日本語で返す。
 */
export function formatRemainingUntilDue(
  iso: string,
  language: AppLanguage = 'ja',
  nowMs = Date.now(),
): string | null {
  const text = messagesForLanguage(language).calendar;
  const dueMs = Date.parse(iso);
  if (Number.isNaN(dueMs)) return null;
  let ms = dueMs - nowMs;
  if (ms <= 0) {
    const over = -ms;
    const days = Math.floor(over / 86400000);
    if (days >= 1) return text.overdueDays(days);
    const hours = Math.floor(over / 3600000);
    if (hours >= 1) return text.overdueHours(hours);
    const mins = Math.floor(over / 60000);
    if (mins >= 1) return text.overdueMinutes(mins);
    return text.overdue;
  }
  const days = Math.floor(ms / 86400000);
  ms -= days * 86400000;
  const hours = Math.floor(ms / 3600000);
  ms -= hours * 3600000;
  const mins = Math.floor(ms / 60000);
  const parts: string[] = [];
  if (days) parts.push(text.days(days));
  if (hours) parts.push(text.hours(hours));
  if (!days && !hours && mins) parts.push(text.minutes(mins));
  if (!days && !hours && !mins) return text.dueSoon;
  return text.remaining(parts.join(language === 'en' ? ' ' : ''));
}

function buildAssignmentCalEvent(rep: DueItem, language: AppLanguage): CalEvent {
  const t = messagesForLanguage(language);
  const start = String(rep.dueDate).trim();
  const title = String(rep.title ?? '').trim() || t.common.untitled;
  const courseName = String(rep.courseName ?? '').trim();
  const cid = String(rep.courseId ?? '').trim();
  const tipLines: string[] = [
    courseName && `${t.calendar.course}: ${courseName}`,
    `${t.calendar.due}: ${formatDueLabel(start, language)}`,
  ].filter(Boolean) as string[];
  const status = resolveAssignmentDisplayStatus(rep.submitted, start);
  const statusLabel = assignmentStatusLabel(status, language);
  if (statusLabel) tipLines.push(`${t.calendar.status}: ${statusLabel}`);
  const tip = tipLines.join('\n');
  const href = cid ? `${KING_LMS_ORIGIN}/ultra/courses/${encodeURIComponent(cid)}/outline` : '';
  return {
    start,
    title,
    tooltip: tip,
    calMeta: courseName,
    calTime: formatDueLabel(start, language),
    href,
    assignmentSubmitted: rep.submitted,
  };
}

/** 課題データ配列をカレンダーイベント配列に変換する */
export function dueItemsToCalEvents(raw: DueItem[], language: AppLanguage = 'ja'): CalEvent[] {
  const rows = (Array.isArray(raw) ? raw : []).filter(
    (r) => r && r.dueDate != null && String(r.dueDate).trim() !== '',
  );

  const mergeGroups = new Map<string, DueItem[]>();
  const unmerged: DueItem[] = [];

  for (const row of rows) {
    const mk = assignmentMergeKey(row);
    if (mk) {
      const list = mergeGroups.get(mk);
      if (list) list.push(row);
      else mergeGroups.set(mk, [row]);
    } else {
      unmerged.push(row);
    }
  }

  const unmergedBundles = new Map<string, DueItem[]>();
  for (const row of unmerged) {
    const dk = assignmentDisplayKey(row);
    const list = unmergedBundles.get(dk);
    if (list) list.push(row);
    else unmergedBundles.set(dk, [row]);
  }

  const out: CalEvent[] = [];
  const seenDisp = new Set<string>();

  const locale = localeForLanguage(language);

  for (const [, group] of mergeGroups) {
    const rep = pickRepresentative(group, locale);
    const dedup = assignmentDisplayKey(rep);
    if (seenDisp.has(dedup)) continue;
    seenDisp.add(dedup);
    out.push(buildAssignmentCalEvent(rep, language));
  }

  for (const [, bundle] of unmergedBundles) {
    const rep = pickRepresentative(bundle, locale);
    const dedup = assignmentDisplayKey(rep);
    if (seenDisp.has(dedup)) continue;
    seenDisp.add(dedup);
    out.push(buildAssignmentCalEvent(rep, language));
  }

  out.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return out;
}

/** 今日を含む月の MonthRef を返す */
export function todayMonthRef(iso: string) {
  return isoToMonthRef(iso);
}
