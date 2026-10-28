import { describe, expect, it } from 'vitest';
import { parseSyncViaMyLinks } from './parsers';

describe('parseSyncViaMyLinks', () => {
  it('is off unless the user turned it on', () => {
    expect(parseSyncViaMyLinks(undefined)).toBe(false);
    expect(parseSyncViaMyLinks(null)).toBe(false);
    expect(parseSyncViaMyLinks('yes')).toBe(false);
    expect(parseSyncViaMyLinks(false)).toBe(false);
    expect(parseSyncViaMyLinks(true)).toBe(true);
  });
});
