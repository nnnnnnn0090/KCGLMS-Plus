/**
 * King LMS calendarItems → 課題カレンダー用 DueItem へ変換。
 */

import type { DueItem } from '../ui/calendar/assignment';

const GRADABLE_ITEM_TYPE = 'blackboard.platform.gradebook2.GradableItem';

function calendarItemCourseName(row: Record<string, unknown>): string {
  const nameLoc = row.calendarNameLocalizable as Record<string, unknown> | undefined;
  const raw = nameLoc?.rawValue;
  return raw != null ? String(raw).trim() : '';
}

function calendarItemDueIso(row: Record<string, unknown>): string {
  const end = row.endDate;
  if (end != null && String(end).trim() !== '') return String(end).trim();
  const start = row.startDate;
  if (start != null && String(start).trim() !== '') return String(start).trim();
  return '';
}

/** GradableItem（課題・テスト等の締切）のみ DueItem に変換する */
export function calendarItemToDueItem(row: unknown): DueItem | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (String(r.itemSourceType ?? '').trim() !== GRADABLE_ITEM_TYPE) return null;

  const dueDate = calendarItemDueIso(r);
  if (!dueDate) return null;

  const calendarId = r.calendarId;
  const sourceId = r.itemSourceId;
  const title = r.title;

  return {
    courseId: calendarId != null ? String(calendarId).trim() : undefined,
    courseName: calendarItemCourseName(r),
    title: title != null ? String(title) : undefined,
    dueDate,
    sourceId: sourceId != null ? String(sourceId).trim() : undefined,
  };
}

export function calendarItemsToDueItems(items: unknown[]): DueItem[] {
  const out: DueItem[] = [];
  for (const row of items) {
    const due = calendarItemToDueItem(row);
    if (due) out.push(due);
  }
  return out;
}

function dueItemMergeKey(row: DueItem): string {
  const cid = String(row.courseId ?? '').trim();
  const sid = String(row.sourceId ?? '').trim();
  const due = String(row.dueDate ?? '').trim();
  if (cid && sid && due) return `${cid}\0${sid}\0${due}`;
  const title = String(row.title ?? '').trim();
  return `${due}\0${title}\0${cid}`;
}

/** 同一課題の重複行をマージ（複数 calendarItems レスポンスの統合用） */
export function mergeDueItems(rows: DueItem[]): DueItem[] {
  const byKey = new Map<string, DueItem>();
  for (const row of rows) {
    byKey.set(dueItemMergeKey(row), row);
  }
  return [...byKey.values()];
}

/** 課題同期用: 今日を中心に最大 16 週間（前後 8 週） */
export function assignmentSyncCalendarRange(now = new Date()): { since: string; until: string } {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const halfSpan = 8 * weekMs;
  return {
    since: new Date(now.getTime() - halfSpan).toISOString(),
    until: new Date(now.getTime() + halfSpan).toISOString(),
  };
}
