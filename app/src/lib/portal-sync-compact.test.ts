import { describe, expect, it } from 'vitest';
import { SK } from '../contract/storage-keys';
import {
  compactPortalSyncStorage,
  decodePortalSyncCompactPayload,
  encodePortalSyncCompactPayload,
  expandPortalSyncStorage,
} from './portal-sync-compact';

describe('portal-sync-compact', () => {
  it('uses short keys and compact values', () => {
    const compact = compactPortalSyncStorage({
      [SK.theme]: 'dark',
      [SK.hideProfileName]: true,
      [SK.showKogiCalMascot]: false,
      [SK.calendarWeekStart]: 'monday',
      [SK.clientUserId]: '550e8400-e29b-41d4-a716-446655440000',
      [SK.customThemes]: { schemaVersion: 1, themes: [] },
    });
    expect(compact).toEqual({
      t: 'dark',
      h: 1,
      k: 0,
      w: 'm',
      id: '550e8400e29b41d4a716446655440000',
    });
    expect(compact.ct).toBeUndefined();
  });

  it('round-trips compact payload json', () => {
    const json = encodePortalSyncCompactPayload(1_700_000_000_000, {
      [SK.theme]: 'dark',
      [SK.language]: 'ja',
      [SK.home2WebMailOverlay]: true,
    });
    expect(json.length).toBeLessThan(80);
    const decoded = decodePortalSyncCompactPayload(json);
    expect(decoded?.updatedAt).toBe(1_700_000_000_000);
    expect(decoded?.storage[SK.theme]).toBe('dark');
    expect(decoded?.storage[SK.language]).toBe('ja');
    expect(decoded?.storage[SK.home2WebMailOverlay]).toBe(true);
  });

  it('rejects malformed compact payload metadata', () => {
    expect(decodePortalSyncCompactPayload('{"v":4,"u":-1,"s":{}}')).toBeNull();
    expect(decodePortalSyncCompactPayload('{"v":4,"u":1,"s":[]}')).toBeNull();
    expect(decodePortalSyncCompactPayload('{"v":4,"u":1,"s":"bad"}')).toBeNull();
  });

  it('expands compact storage back to long keys', () => {
    const expanded = expandPortalSyncStorage({
      t: 'dark',
      w: 's',
      id: '550e8400e29b41d4a716446655440000',
    });
    expect(expanded[SK.theme]).toBe('dark');
    expect(expanded[SK.calendarWeekStart]).toBe('sunday');
    expect(expanded[SK.clientUserId]).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('round-trips custom cal events and band collapse', () => {
    const events = {
      schemaVersion: 1 as const,
      events: [
        {
          id: 'custom-ev-1',
          title: 'バイト',
          kind: 'recurring' as const,
          weekday: 1 as const,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    const compact = compactPortalSyncStorage({
      [SK.customCalEvents]: events,
      [SK.customCalBandCollapsed]: true,
    });
    expect(compact.ce).toEqual([
      ['custom-ev-1', 'バイト', 1, 0, 0, 0, 0, 1_767_225_600, 1_767_225_600],
    ]);
    expect(compact.ceb).toBe(1);
    const expanded = expandPortalSyncStorage(compact);
    expect(expanded[SK.customCalEvents]).toEqual(events);
    expect(expanded[SK.customCalBandCollapsed]).toBe(true);
  });

  it('round-trips ui font preference', () => {
    const json = encodePortalSyncCompactPayload(1_700_000_000_000, {
      [SK.theme]: 'dark',
      [SK.font]: 'zen-maru-gothic',
    });
    const decoded = decodePortalSyncCompactPayload(json);
    expect(decoded?.storage[SK.font]).toBe('zen-maru-gothic');

    expect(compactPortalSyncStorage({ [SK.font]: 'zen-maru-gothic' })).toEqual({ fn: 'z' });
    expect(compactPortalSyncStorage({ [SK.font]: 'noto-sans-jp' })).toEqual({ fn: 'n' });
    expect(compactPortalSyncStorage({ [SK.font]: 'default' }).fn).toBeUndefined();
    expect(expandPortalSyncStorage({ fn: 'b' })[SK.font]).toBe('biz-udpgothic');
  });
});
