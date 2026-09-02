import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assignmentSyncCalendarRange,
  calendarItemsToDueItems,
  calendarItemToDueItem,
  mergeDueItems,
} from './calendar-items-to-due-items';
import { normalizeCalendarItemsResponse } from './king-lms-calendar-response';

describe('calendar-items-to-due-items', () => {
  const capturePath = new URL('./__fixtures__/calendar-items.json', import.meta.url);

  it('converts captured calendarItems to DueItem rows', () => {
    const row = JSON.parse(fs.readFileSync(capturePath, 'utf8')) as { raw: unknown };
    const items = normalizeCalendarItemsResponse(row.raw)!;
    const due = calendarItemsToDueItems(items);
    expect(due.length).toBe(28);
    expect(due[0]).toMatchObject({
      courseId: '_2396_1',
      title: expect.stringContaining('PC'),
      dueDate: '2026-06-28T14:59:00.000Z',
      sourceId: '_173958_1',
    });
  });

  it('skips non-GradableItem rows', () => {
    expect(
      calendarItemToDueItem({ itemSourceType: 'other', startDate: '2026-01-01T00:00:00.000Z' }),
    ).toBeNull();
  });

  it('mergeDueItems deduplicates by course/source/due', () => {
    const a = {
      courseId: '_1_1',
      sourceId: '_2_1',
      dueDate: '2026-06-01T00:00:00.000Z',
      title: 'A',
      courseName: 'C',
    };
    const merged = mergeDueItems([a, { ...a, title: 'B' }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.title).toBeDefined();
  });

  it('assignmentSyncCalendarRange spans 16 weeks', () => {
    const now = new Date('2026-06-23T12:00:00.000Z');
    const { since, until } = assignmentSyncCalendarRange(now);
    const sinceMs = Date.parse(since);
    const untilMs = Date.parse(until);
    const spanWeeks = (untilMs - sinceMs) / (7 * 24 * 60 * 60 * 1000);
    expect(spanWeeks).toBeCloseTo(16, 0);
  });
});
