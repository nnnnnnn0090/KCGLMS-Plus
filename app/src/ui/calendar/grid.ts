/**
 * カレンダーグリッドの HTML 文字列を組み立てる純関数群です。
 * DOM には触れず、`buildCalendarGridHtml` の戻り値を `innerHTML` へ代入する想定です。
 */

import {
  enumerateRange,
  parseIsoLocal,
  toIsoLocal,
  calEventDayIso,
  type CalendarWeekStart,
} from '../../lib/date';
import { esc, escAttr, plainFromHtml } from '../../lib/dom';
import {
  parseKogiMeta,
  parseLeadingPeriodTitle,
  kogiPeriodNum,
  kogiPeriodTimeRange,
  findKingLmsUrl,
  syllabusUrl,
} from './kogi';
import type { CalEvent, ViewMeta } from './types';
import { assignmentStatusLabel, resolveAssignmentDisplayStatus } from './assignment';
import { messagesForLanguage, normalizeLanguage, type AppLanguage } from '../../i18n/messages';
import { buildKingLmsSamlLoginUrl } from '../../shared/king-lms-url';
import {
  customCalEventsForIsoDate,
  formatCustomCalEventTimeLabel,
  type CustomCalEvent,
} from '../../domain/custom-cal-events';

/** 列順は `enumerateRange` と一致するよう weekStart に応じて並べる */
function weekdayLabels(weekStart: CalendarWeekStart, language: AppLanguage): string[] {
  const t = messagesForLanguage(language).calendar;
  return weekStart === 'sunday' ? t.weekdaysSunday : t.weekdaysMonday;
}

function customEventsAsCalEvents(
  customEvents: readonly CustomCalEvent[],
  iso: string,
  language: AppLanguage,
): CalEvent[] {
  const t = messagesForLanguage(language).calendar;
  return customCalEventsForIsoDate(customEvents, iso).map((ev) => ({
    title: ev.title,
    start: iso,
    calTime: formatCustomCalEventTimeLabel(ev, t.customEventAllDay),
    customEventId: ev.id,
  }));
}

// ─── 1 日分のイベント HTML ────────────────────────────────────────────────

function buildDayEventsHtml(
  dayItems: CalEvent[],
  opts: Pick<ViewMeta, 'calKind' | 'mode' | 'kingLmsCourses' | 'language' | 'nowMs'>,
): string {
  const { calKind, mode, kingLmsCourses, language: rawLanguage } = opts;
  const language = normalizeLanguage(rawLanguage);
  const t = messagesForLanguage(language).calendar;
  const common = messagesForLanguage(language).common;
  const parts: string[] = [];
  let prevPeriod: number | null = null;

  for (const ev of dayItems) {
    if (ev.customEventId) {
      // 月表示のみ。週帯と同じくバッジ＋タイトル＋時刻
      const timePlain = String(ev.calTime ?? '').trim();
      const badge = `<span class="p-cal-custom-ev-badge" aria-hidden="true">${esc(t.customEventBadge)}</span>`;
      const metaHtml = timePlain ? `<span class="p-cal-ev-meta">${esc(timePlain)}</span>` : '';
      parts.push(
        `<button type="button" class="p-cal-ev p-cal-custom-ev" data-cal-kind="custom" data-custom-event-id="${escAttr(ev.customEventId)}" aria-label="${escAttr(`${ev.title || common.untitled} · ${timePlain}`)}">` +
          badge +
          `<span class="p-cal-ev-title">${esc(ev.title || common.untitled)}</span>` +
          metaHtml +
          '</button>',
      );
      continue;
    }

    const { period: periodFromTip, room } = parseKogiMeta(ev.tooltip ?? '');
    const { firstNum } = parseLeadingPeriodTitle(ev.title ?? '');
    const period = periodFromTip || firstNum;
    const pNum = calKind === 'kogi' ? kogiPeriodNum(ev) : null;
    const kogiMeta = [period && t.periodValue(String(period)), room].filter(Boolean).join(' · ');
    const meta = String(ev.calMeta ?? '').trim() || kogiMeta;

    // kogi カレンダーでは時限の空きを視覚的に表すギャップ要素を挿入する
    if (calKind === 'kogi' && pNum !== null) {
      const gapFrom = prevPeriod === null ? 1 : prevPeriod + 1;
      for (let g = gapFrom; g < pNum; g++) {
        parts.push('<div class="p-cal-ev-gap" aria-hidden="true"></div>');
      }
    }

    const tipPlain = plainFromHtml(ev.tooltip ?? '');
    const hrefFromEv = String(ev.href ?? '').trim();
    let href = hrefFromEv;
    if (!href) {
      if (calKind === 'kogi') {
        href = findKingLmsUrl(kingLmsCourses, ev.title ?? '');
      } else {
        href = syllabusUrl(ev.tooltip ?? '', tipPlain);
      }
    }
    const timeRange = calKind === 'kogi' ? kogiPeriodTimeRange(period) : String(ev.calTime ?? '');

    const metaHtml =
      mode !== 'month' && meta ? `<span class="p-cal-ev-meta">${esc(meta)}</span>` : '';
    const kindAttr = calKind ? ` data-cal-kind="${escAttr(calKind)}"` : '';
    const dueIsoAttr =
      calKind === 'assignment' && String(ev.start ?? '').trim()
        ? ` data-cal-due-iso="${escAttr(String(ev.start).trim())}"`
        : '';
    const kogiPeriodAttr =
      calKind === 'kogi' && period
        ? ` data-cal-kogi-period="${escAttr(String(period).trim())}"`
        : '';
    const kogiRoomAttr =
      calKind === 'kogi' && room ? ` data-cal-kogi-room="${escAttr(String(room).trim())}"` : '';
    const sub = ev.assignmentSubmitted;
    const dueIso = calKind === 'assignment' ? String(ev.start ?? '').trim() : '';
    const assignmentStatus =
      calKind === 'assignment'
        ? resolveAssignmentDisplayStatus(sub, dueIso || undefined, opts.nowMs)
        : 'unknown';
    const subAttr =
      calKind === 'assignment' && sub !== undefined
        ? ` data-cal-assignment-submitted="${sub ? 'true' : 'false'}"`
        : '';
    const statusAttr =
      assignmentStatus !== 'unknown'
        ? ` data-cal-assignment-status="${escAttr(assignmentStatus)}"`
        : '';
    const statusBadge =
      assignmentStatus !== 'unknown'
        ? `<span class="p-cal-ev-assignment-badge is-${escAttr(assignmentStatus)}" aria-hidden="true">${esc(assignmentStatusLabel(assignmentStatus, language))}</span>`
        : '';
    const dataAttrs =
      `data-cal-title="${escAttr(ev.title ?? '')}" ` +
      `data-cal-meta="${escAttr(meta)}" ` +
      `data-cal-tip="${escAttr(tipPlain)}" ` +
      `data-cal-time="${escAttr(timeRange)}"${kindAttr}${dueIsoAttr}${subAttr}${statusAttr}${kogiPeriodAttr}${kogiRoomAttr}`;
    const titleSpan = `<span class="p-cal-ev-title">${esc(ev.title || common.untitled)}</span>`;
    const inner =
      assignmentStatus !== 'unknown'
        ? `${statusBadge}${titleSpan}${metaHtml}`
        : `${titleSpan}${metaHtml}`;
    const evClasses = ['p-cal-ev'];
    if (assignmentStatus === 'submitted') evClasses.push('is-assignment-submitted');
    if (assignmentStatus === 'pending') evClasses.push('is-assignment-pending');
    if (assignmentStatus === 'overdue') evClasses.push('is-assignment-overdue');
    const evClass = evClasses.join(' ');

    const navigationHref =
      href && (calKind === 'kogi' || calKind === 'assignment')
        ? buildKingLmsSamlLoginUrl(href)
        : href;
    parts.push(
      navigationHref
        ? `<a class="${escAttr(evClass)}" href="${escAttr(navigationHref)}" target="_blank" rel="noopener noreferrer" ${dataAttrs}>${inner}</a>`
        : `<div class="${escAttr(evClass)}" ${dataAttrs}>${inner}</div>`,
    );

    if (pNum !== null) prevPeriod = pNum;
  }
  return parts.join('');
}

// ─── グリッド HTML ─────────────────────────────────────────────────────────

/**
 * カレンダーグリッドの HTML 文字列を構築する。
 * DOM 操作は行わず HTML 文字列を返す（calBody.innerHTML に設定される）。
 */
export function buildCalendarGridHtml(
  items: CalEvent[],
  range: { start: string; end: string },
  viewMeta: ViewMeta,
): string {
  if (!range?.start || !range?.end) {
    return `<p class="p-empty">${esc(messagesForLanguage(viewMeta?.language).calendar.rangeUnavailable)}</p>`;
  }

  const days = enumerateRange(range.start, range.end);
  if (days.length === 0)
    return `<p class="p-empty">${esc(messagesForLanguage(viewMeta?.language).calendar.noDates)}</p>`;

  const mode = viewMeta?.mode === 'month' ? 'month' : 'week';
  const monthRef = viewMeta?.monthRef ?? null;
  const kingLmsCourses = Array.isArray(viewMeta?.kingLmsCourses) ? viewMeta.kingLmsCourses : [];
  const calKind = viewMeta?.calKind ?? '';
  const weekStart = viewMeta?.weekStart ?? 'monday';
  const language = normalizeLanguage(viewMeta?.language);
  const todayIso = viewMeta?.todayIso ?? toIsoLocal(new Date());
  const calendarMessages = messagesForLanguage(language).calendar;

  // イベントを日付でグループ化
  const byDay = new Map<string, CalEvent[]>();
  for (const item of Array.isArray(items) ? items : []) {
    const day = calEventDayIso(item);
    if (!day) continue;
    const bucket = byDay.get(day);
    if (bucket) bucket.push(item);
    else byDay.set(day, [item]);
  }

  const heads = weekdayLabels(weekStart, language)
    .map((w) => `<div class="p-cal-wd">${esc(w)}</div>`)
    .join('');

  const cells = days
    .map((iso) => {
      const d = parseIsoLocal(iso);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      const isToday = iso === todayIso;
      // 月表示で対象月以外のセルを淡色にする
      const isMuted =
        mode === 'month' && monthRef
          ? d.getFullYear() !== monthRef.y || d.getMonth() !== monthRef.m
          : false;

      const dayItems = [...(byDay.get(iso) ?? [])];
      if (calKind === 'kogi') {
        // kogi は時限順でソート（null は末尾）
        dayItems.sort((a, b) => {
          const pa = kogiPeriodNum(a);
          const pb = kogiPeriodNum(b);
          if (pa === null && pb === null) return 0;
          if (pa === null) return 1;
          if (pb === null) return -1;
          return pa - pb;
        });
        // 月表示: 追加予定は授業の下に載せる（週は帯 UI のみ）
        if (mode === 'month') {
          const customItems = customEventsAsCalEvents(viewMeta?.customEvents ?? [], iso, language);
          dayItems.push(...customItems);
        }
      }

      const evHtml = buildDayEventsHtml(dayItems, {
        calKind,
        mode,
        kingLmsCourses,
        language,
        nowMs: viewMeta?.nowMs,
      });
      const cls = ['p-cal-cell', isMuted && 'is-muted', isToday && 'is-today']
        .filter(Boolean)
        .join(' ');
      const ariaCur = isToday ? ' aria-current="date"' : '';
      const dayAdd =
        calKind === 'kogi' && mode === 'month'
          ? `<button type="button" class="p-cal-custom-day-add" data-custom-day-add="${escAttr(iso)}" aria-label="${escAttr(calendarMessages.customBandAddAria)}" title="${escAttr(calendarMessages.customBandAdd)}">＋</button>`
          : '';

      return (
        `<div class="${cls}"${ariaCur} data-cal-day-iso="${escAttr(iso)}">` +
        `<div class="p-cal-day-num"><span>${esc(label)}</span>${dayAdd}</div>` +
        `<div class="p-cal-day-body">${evHtml}</div>` +
        '</div>'
      );
    })
    .join('');

  return `<div class="p-cal-grid is-${mode}">${heads}${cells}</div>`;
}
