import { describe, expect, it } from 'vitest';
import { parseCalendarWeekStart, parseStorageBool, parseThemeId } from './parsers';
import { SK } from '../../contract/storage-keys';

describe('storage parsers', () => {
  it('parses theme id with default', () => {
    expect(parseThemeId(undefined)).toBe('dark');
    expect(parseThemeId('  cherryBlossom ')).toBe('cherryBlossom');
  });

  it('parses calendar week start', () => {
    expect(parseCalendarWeekStart('sunday')).toBe('sunday');
    expect(parseCalendarWeekStart('monday')).toBe('monday');
    expect(parseCalendarWeekStart('invalid')).toBe('monday');
  });

  it('returns bool defaults for unknown keys', () => {
    expect(parseStorageBool(SK.portalGuidedTourDone, undefined)).toBe(false);
    expect(parseStorageBool(SK.portalGuidedTourDone, true)).toBe(true);
  });
});
