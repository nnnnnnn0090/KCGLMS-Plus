import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildCalendarGridHtml } from './grid';
import type { ViewMeta } from './types';
import { KING_LMS_ORIGIN, KING_LMS_SAML_LOGIN_PATH } from '../../shared/king-lms-url';

const baseMeta: ViewMeta = {
  mode: 'week',
  monthRef: null,
  kingLmsCourses: [],
  calKind: 'assignment',
  weekStart: 'monday',
  language: 'ja',
  todayIso: '2026-07-02',
};

beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: () => {
      let text = '';
      return {
        set textContent(value: string) {
          text = value;
        },
        get innerHTML() {
          return text
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
        },
      };
    },
  });
});

afterAll(() => vi.unstubAllGlobals());

describe('buildCalendarGridHtml King LMS links', () => {
  it('課題リンクをSAMLログインURLで包む', () => {
    const destination = `${KING_LMS_ORIGIN}/ultra/courses/course-id/outline`;
    const html = buildCalendarGridHtml(
      [{ start: '2026-07-02T12:00:00', title: '課題', href: destination }],
      { start: '2026-06-29', end: '2026-07-06' },
      baseMeta,
    );

    expect(html).toContain(KING_LMS_SAML_LOGIN_PATH);
    expect(html).toContain(encodeURIComponent(destination).replaceAll('%20', '+'));
    expect(html).not.toContain(`href="${destination}"`);
  });

  it('授業コースの保存済みURLをSAMLログインURLで包む', () => {
    const destination = `${KING_LMS_ORIGIN}/ultra/courses/course-id/outline`;
    const html = buildCalendarGridHtml(
      [{ start: '2026-07-02', title: '1 Web Programming' }],
      { start: '2026-06-29', end: '2026-07-06' },
      {
        ...baseMeta,
        calKind: 'kogi',
        kingLmsCourses: [{ displayName: 'Mon1 Web Programming', externalAccessUrl: destination }],
      },
    );

    expect(html).toContain(KING_LMS_SAML_LOGIN_PATH);
    expect(html).not.toContain(`href="${destination}"`);
  });

  it('月表示の授業カレンダーに追加予定を日セルへ載せる', () => {
    const html = buildCalendarGridHtml(
      [{ start: '2026-07-06', title: '1 プログラミング' }],
      { start: '2026-06-29', end: '2026-08-10' },
      {
        ...baseMeta,
        mode: 'month',
        monthRef: { y: 2026, m: 6 },
        calKind: 'kogi',
        customEvents: [
          {
            id: 'custom-1',
            title: 'バイト',
            kind: 'recurring',
            weekday: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'custom-2',
            title: '通院',
            note: '午前',
            kind: 'once',
            date: '2026-07-06',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    );

    expect(html).toContain('data-cal-kind="custom"');
    expect(html).toContain('data-custom-event-id="custom-1"');
    expect(html).toContain('data-custom-event-id="custom-2"');
    expect(html).toContain('バイト');
    expect(html).toContain('通院');
    expect(html).toContain('data-custom-day-add="2026-07-06"');
    expect(html).toContain('p-cal-custom-ev-badge');
    expect(html).toContain('追加');
    expect(html).toContain('終日');
  });

  it('月表示の追加予定は時限の間ではなく末尾に置く', () => {
    const html = buildCalendarGridHtml(
      [
        { start: '2026-07-06', title: '1 プログラミング' },
        { start: '2026-07-06', title: '3 データベース' },
      ],
      { start: '2026-06-29', end: '2026-08-10' },
      {
        ...baseMeta,
        mode: 'month',
        monthRef: { y: 2026, m: 6 },
        calKind: 'kogi',
        customEvents: [
          {
            id: 'custom-mid',
            title: '昼休みミーティング',
            timeStart: '12:30',
            kind: 'once',
            date: '2026-07-06',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    );

    const idxProg = html.indexOf('プログラミング');
    const idxDb = html.indexOf('データベース');
    const idxMeet = html.indexOf('昼休みミーティング');
    expect(idxProg).toBeGreaterThan(-1);
    expect(idxDb).toBeGreaterThan(idxProg);
    expect(idxMeet).toBeGreaterThan(idxDb);
  });

  it('週表示では追加予定をグリッドへマージしない', () => {
    const html = buildCalendarGridHtml(
      [],
      { start: '2026-06-29', end: '2026-07-06' },
      {
        ...baseMeta,
        mode: 'week',
        calKind: 'kogi',
        customEvents: [
          {
            id: 'custom-1',
            title: 'バイト',
            kind: 'recurring',
            weekday: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    );
    expect(html).not.toContain('data-cal-kind="custom"');
  });
});
