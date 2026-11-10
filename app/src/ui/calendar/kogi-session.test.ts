import { describe, expect, it } from 'vitest';
import {
  academicYearFromRange,
  academicYearOf,
  academicYearsForRange,
  buildKogiSessionIndex,
  lookupKogiSession,
} from './kogi-session';

const ev = (start: string, title: string, code?: string) => ({
  start,
  title,
  tooltip: `時限：${title.split(' ')[0]}<br>教室：A301${code ? `<br>コード：${code}` : ''}`,
});

describe('academic year helpers', () => {
  it('1〜3 月は前年度、4 月からは当年度', () => {
    expect(academicYearOf('2026-03-31')).toBe(2025);
    expect(academicYearOf('2026-04-01')).toBe(2026);
    expect(academicYearOf('2026-12-15')).toBe(2026);
  });

  it('学年度 1 年分の区間だけを見分ける', () => {
    expect(academicYearFromRange('2026-04-01', '2027-04-01')).toBe(2026);
    expect(academicYearFromRange('2026-01-01', '2027-01-01')).toBeNull();
    expect(academicYearFromRange('2026-04-01', '2026-04-08')).toBeNull();
  });

  it('3/31 と 4/1 をまたぐ週は 2 年度分', () => {
    expect(academicYearsForRange('2026-03-30', '2026-04-06')).toEqual([2025, 2026]);
    expect(academicYearsForRange('2026-11-09', '2026-11-16')).toEqual([2026]);
  });
});

describe('buildKogiSessionIndex', () => {
  const items = [
    ev('2026-10-12', '3 データベース概論', 'K100'),
    ev('2026-10-05', '3 データベース概論', 'K100'),
    ev('2026-10-05', '4 データベース概論', 'K100'),
    ev('2026-10-19', '3 データベース概論', 'K100'),
    ev('2026-10-06', '1 ネットワーク技術', 'K200'),
    ev('2026-10-13', '1 ネットワーク技術', 'K200'),
  ];
  const index = buildKogiSessionIndex(items);

  it('講義コードごとに日付順で数える', () => {
    expect(lookupKogiSession(index, items[1])).toBe(1);
    expect(lookupKogiSession(index, items[0])).toBe(2);
    expect(lookupKogiSession(index, items[3])).toBe(3);
    expect(lookupKogiSession(index, items[5])).toBe(2);
  });

  it('同じ日の連続コマは同じ回として扱う', () => {
    expect(lookupKogiSession(index, items[2])).toBe(1);
  });

  it('コードが無いときは時限を除いた授業名で数える', () => {
    const noCode = [ev('2026-10-07', '2 英語', undefined), ev('2026-10-14', '5 英語', undefined)];
    const idx = buildKogiSessionIndex(noCode);
    expect(lookupKogiSession(idx, noCode[1])).toBe(2);
  });

  it('集計に無いイベントや空の対応表は null', () => {
    expect(lookupKogiSession(index, ev('2026-10-26', '3 データベース概論', 'K100'))).toBeNull();
    expect(lookupKogiSession(new Map(), items[0])).toBeNull();
    expect(lookupKogiSession(undefined, items[0])).toBeNull();
  });
});
