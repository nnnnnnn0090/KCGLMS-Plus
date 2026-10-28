import { describe, expect, it } from 'vitest';
import {
  createCustomCalEvent,
  customCalEventsForIsoDate,
  formatCustomCalEventTime,
  formatCustomCalEventTimeLabel,
  formatCustomCalEventUrlLabel,
  normalizeCustomCalEventUrl,
  parseCustomCalEventCollection,
  parseCustomCalEventCollectionWithReport,
  safeCustomCalEventUrls,
  updateCustomCalEvent,
} from './custom-cal-events';

describe('parseCustomCalEventCollection', () => {
  it('keeps saved events beyond the limit so they are never deleted by a later save', () => {
    const at = '2026-01-01T00:00:00.000Z';
    const events = Array.from({ length: 101 }, (_, i) => ({
      id: `event-${i}`,
      title: `E${i}`,
      kind: 'once',
      date: '2026-11-01',
      createdAt: at,
      updatedAt: at,
    }));
    const result = parseCustomCalEventCollectionWithReport({ schemaVersion: 1, events });
    expect(result.collection.events).toHaveLength(101);
    // 読み込み（インポート）では上限超えとして扱う。
    expect(result.truncated).toBe(true);
  });

  it('rejects invalid schema', () => {
    expect(parseCustomCalEventCollection(null)).toEqual({ schemaVersion: 1, events: [] });
    expect(parseCustomCalEventCollection({ schemaVersion: 2, events: [] })).toEqual({
      schemaVersion: 1,
      events: [],
    });
  });

  it('keeps valid recurring and once events', () => {
    const parsed = parseCustomCalEventCollection({
      schemaVersion: 1,
      events: [
        {
          id: 'abc123',
          title: 'バイト',
          kind: 'recurring',
          weekday: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'def456',
          title: '休み',
          note: '病院',
          kind: 'once',
          date: '2026-07-15',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        { id: 'bad', title: 'x', kind: 'once', date: '2026-13-99' },
      ],
    });
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events[0]).toMatchObject({ kind: 'recurring', weekday: 1, title: 'バイト' });
    expect(parsed.events[1]).toMatchObject({ kind: 'once', date: '2026-07-15', note: '病院' });
  });

  it('uses deterministic timestamps for missing or invalid stored metadata', () => {
    const parsed = parseCustomCalEventCollection({
      schemaVersion: 1,
      events: [
        {
          id: 'abc123',
          title: '予定',
          kind: 'recurring',
          weekday: 1,
          createdAt: 'invalid',
        },
      ],
    });
    expect(parsed.events[0]?.createdAt).toBe('1970-01-01T00:00:00.000Z');
    expect(parsed.events[0]?.updatedAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('reports rejected entries instead of silently accepting a lossy import', () => {
    const result = parseCustomCalEventCollectionWithReport({
      schemaVersion: 1,
      events: [
        {
          id: 'valid-1',
          title: '予定',
          kind: 'once',
          date: '2026-07-06',
        },
        { id: 'bad', title: '', kind: 'once', date: 'not-a-date' },
      ],
    });
    expect(result.collection.events).toHaveLength(1);
    expect(result.rejectedCount).toBe(1);
    expect(result.truncated).toBe(false);
  });
});

describe('formatCustomCalEventTime', () => {
  it('formats start and range', () => {
    expect(formatCustomCalEventTime({ timeStart: '09:30' })).toBe('09:30');
    expect(formatCustomCalEventTime({ timeStart: '09:30', timeEnd: '11:00' })).toBe('09:30–11:00');
    expect(formatCustomCalEventTime({})).toBe('');
  });
});

describe('formatCustomCalEventTimeLabel', () => {
  it('falls back to all-day label', () => {
    expect(formatCustomCalEventTimeLabel({ timeStart: '09:30' }, '終日')).toBe('09:30');
    expect(formatCustomCalEventTimeLabel({}, '終日')).toBe('終日');
  });
});

describe('createCustomCalEvent / updateCustomCalEvent', () => {
  it('creates and updates while preserving id', () => {
    const created = createCustomCalEvent({
      title: '  部活  ',
      kind: 'recurring',
      weekday: 3,
      timeStart: '16:00',
      timeEnd: '18:00',
    });
    expect(created).toMatchObject({
      title: '部活',
      kind: 'recurring',
      weekday: 3,
      timeStart: '16:00',
      timeEnd: '18:00',
    });
    expect(created?.id).toBeTruthy();

    const updated = updateCustomCalEvent(created!, {
      title: '試合',
      kind: 'once',
      date: '2026-08-01',
      note: '会場A',
      timeStart: '10:30',
    });
    expect(updated).toMatchObject({
      id: created!.id,
      title: '試合',
      kind: 'once',
      date: '2026-08-01',
      note: '会場A',
      timeStart: '10:30',
      createdAt: created!.createdAt,
    });
    expect(updated?.timeEnd).toBeUndefined();
  });

  it('drops end time when start is missing or end is before start', () => {
    const a = createCustomCalEvent({
      title: 'x',
      kind: 'once',
      date: '2026-08-01',
      timeEnd: '10:00',
    });
    expect(a?.timeStart).toBeUndefined();
    expect(a?.timeEnd).toBeUndefined();

    const b = createCustomCalEvent({
      title: 'y',
      kind: 'once',
      date: '2026-08-01',
      timeStart: '12:00',
      timeEnd: '11:00',
    });
    expect(b).toMatchObject({ timeStart: '12:00' });
    expect(b?.timeEnd).toBeUndefined();
  });

  it('keeps up to 4 http(s) urls and drops unsafe schemes', () => {
    const created = createCustomCalEvent({
      title: 'オンライン',
      kind: 'once',
      date: '2026-08-01',
      urls: [
        'https://zoom.us/j/1',
        'zoom.us/j/2',
        'javascript:alert(1)',
        'https://teams.microsoft.com/l/meetup',
        'https://example.com/a',
        'https://example.com/b',
      ],
    });
    expect(created?.urls).toEqual([
      'https://zoom.us/j/1',
      'https://zoom.us/j/2',
      'https://teams.microsoft.com/l/meetup',
      'https://example.com/a',
    ]);
  });

  it('keeps multiple long Teams-like urls without collapsing them', () => {
    const contextA = encodeURIComponent(
      JSON.stringify({ Tid: 'aaa', Oid: '111', long: 'x'.repeat(800) }),
    );
    const contextB = encodeURIComponent(
      JSON.stringify({ Tid: 'bbb', Oid: '222', long: 'y'.repeat(800) }),
    );
    const a = `https://teams.microsoft.com/l/meetup-join/19%3ameeting_AAA@thread.v2/0?context=${contextA}`;
    const b = `https://teams.microsoft.com/l/meetup-join/19%3ameeting_BBB@thread.v2/0?context=${contextB}`;
    expect(a.length).toBeGreaterThan(500);
    expect(b.length).toBeGreaterThan(500);
    const created = createCustomCalEvent({
      title: '遠隔',
      kind: 'once',
      date: '2026-08-01',
      urls: [a, b],
    });
    expect(created?.urls).toHaveLength(2);
    expect(created?.urls?.[0]).toContain('meeting_AAA');
    expect(created?.urls?.[1]).toContain('meeting_BBB');
  });
});

describe('normalizeCustomCalEventUrl / safeCustomCalEventUrls', () => {
  it('normalizes and dedupes', () => {
    expect(normalizeCustomCalEventUrl('https://example.com/x')).toBe('https://example.com/x');
    expect(normalizeCustomCalEventUrl('example.com/x')).toBe('https://example.com/x');
    expect(normalizeCustomCalEventUrl('example.com:8443/room')).toBe(
      'https://example.com:8443/room',
    );
    expect(normalizeCustomCalEventUrl('javascript:alert(1)')).toBeNull();
    expect(safeCustomCalEventUrls(['https://a.test', 'https://a.test', '', 'ftp://x'])).toEqual([
      'https://a.test/',
    ]);
  });

  it('formats compact labels', () => {
    expect(formatCustomCalEventUrlLabel('https://www.zoom.us/j/123')).toBe('zoom.us/j/123');
  });
});

describe('parseCustomCalEventCollection urls', () => {
  it('round-trips urls on stored events', () => {
    const parsed = parseCustomCalEventCollection({
      schemaVersion: 1,
      events: [
        {
          id: 'url-ev-1',
          title: '遠隔',
          kind: 'once',
          date: '2026-09-01',
          urls: ['https://zoom.us/j/9', 'javascript:no'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(parsed.events[0]?.urls).toEqual(['https://zoom.us/j/9']);
  });
});

describe('customCalEventsForIsoDate', () => {
  it('matches weekday recurring and exact once dates', () => {
    const monday = createCustomCalEvent({ title: '月', kind: 'recurring', weekday: 1 })!;
    const once = createCustomCalEvent({ title: '単発', kind: 'once', date: '2026-07-06' })!;
    // 2026-07-06 is Monday
    const list = customCalEventsForIsoDate([monday, once], '2026-07-06');
    expect(list.map((e) => e.title).sort()).toEqual(['単発', '月']);
    expect(customCalEventsForIsoDate([monday, once], '2026-07-07')).toEqual([]);
  });

  it('sorts by start time', () => {
    const late = createCustomCalEvent({
      title: '遅い',
      kind: 'once',
      date: '2026-07-06',
      timeStart: '18:00',
    })!;
    const early = createCustomCalEvent({
      title: '早い',
      kind: 'once',
      date: '2026-07-06',
      timeStart: '09:00',
    })!;
    const allDay = createCustomCalEvent({
      title: '終日',
      kind: 'once',
      date: '2026-07-06',
    })!;
    const list = customCalEventsForIsoDate([late, allDay, early], '2026-07-06');
    expect(list.map((e) => e.title)).toEqual(['早い', '遅い', '終日']);
  });
});
