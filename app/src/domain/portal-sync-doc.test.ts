import { describe, expect, it } from 'vitest';
import { SK } from '../contract/storage-keys';
import {
  mergePortalSyncDocs,
  portalSyncDocsEqual,
  portalSyncDocToStorage,
  portalSyncItemEntryId,
  prunePortalSyncTombstones,
  stampPortalSyncChange,
  type PortalSyncDoc,
  type PortalSyncEntry,
} from './portal-sync-doc';

function event(id: string, title: string, createdAt = '2026-01-01T00:00:00.000Z') {
  return { id, title, kind: 'once', date: '2026-02-01', createdAt, updatedAt: createdAt };
}

function events(...items: ReturnType<typeof event>[]) {
  return { schemaVersion: 1, events: items };
}

/** 決定的な疑似乱数（テストの再現性のため） */
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

function randomDoc(random: () => number): PortalSyncDoc {
  const ids = [SK.theme, SK.language, portalSyncItemEntryId(SK.customCalEvents, 'a'), 'x'];
  const out: Record<string, PortalSyncEntry> = {};
  for (const id of ids) {
    if (random() < 0.3) continue;
    const s = { t: Math.floor(random() * 5), d: random() < 0.5 ? 'p' : 'q' };
    out[id] = random() < 0.25 ? { s, del: true } : { s, v: Math.floor(random() * 3) };
  }
  return out;
}

describe('portal sync doc merge', () => {
  it('is commutative, associative and idempotent (devices always converge)', () => {
    const random = rng(42);
    for (let i = 0; i < 500; i += 1) {
      const a = randomDoc(random);
      const b = randomDoc(random);
      const c = randomDoc(random);
      expect(portalSyncDocsEqual(mergePortalSyncDocs(a, b), mergePortalSyncDocs(b, a))).toBe(true);
      expect(
        portalSyncDocsEqual(
          mergePortalSyncDocs(mergePortalSyncDocs(a, b), c),
          mergePortalSyncDocs(a, mergePortalSyncDocs(b, c)),
        ),
      ).toBe(true);
      expect(portalSyncDocsEqual(mergePortalSyncDocs(a, a), a)).toBe(true);
    }
  });

  it('keeps the newer change per key instead of the newer snapshot', () => {
    const pc: PortalSyncDoc = {
      [SK.theme]: { s: { t: 10, d: 'pc' }, v: 'ocean' },
      [SK.language]: { s: { t: 1, d: 'pc' }, v: 'ja' },
    };
    const phone: PortalSyncDoc = {
      [SK.theme]: { s: { t: 1, d: 'phone' }, v: 'dark' },
      [SK.language]: { s: { t: 20, d: 'phone' }, v: 'en' },
    };
    const { values } = portalSyncDocToStorage(mergePortalSyncDocs(pc, phone));
    expect(values[SK.theme]).toBe('ocean');
    expect(values[SK.language]).toBe('en');
  });

  it('merges events added on different devices one by one', () => {
    const pc = stampPortalSyncChange(SK.customCalEvents, undefined, events(event('a', 'PC')), {
      t: 5,
      d: 'pc',
    });
    const phone = stampPortalSyncChange(
      SK.customCalEvents,
      undefined,
      events(event('b', 'Phone')),
      { t: 6, d: 'phone' },
    );
    const { values } = portalSyncDocToStorage(mergePortalSyncDocs(pc, phone));
    const merged = values[SK.customCalEvents] as { events: { id: string }[] };
    expect(merged.events.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('propagates deletions as tombstones', () => {
    const before = events(event('a', 'A'), event('b', 'B'));
    const created = stampPortalSyncChange(SK.customCalEvents, undefined, before, { t: 1, d: 'p' });
    const deleted = stampPortalSyncChange(SK.customCalEvents, before, events(event('b', 'B')), {
      t: 2,
      d: 'q',
    });
    const merged = mergePortalSyncDocs(created, deleted);
    const value = portalSyncDocToStorage(merged).values[SK.customCalEvents] as {
      events: { id: string }[];
    };
    expect(value.events.map((item) => item.id)).toEqual(['b']);
  });

  it('only stamps entries that actually changed', () => {
    const before = events(event('a', 'A'), event('b', 'B'));
    const after = events(event('a', 'A'), event('b', 'B2'));
    const changed = stampPortalSyncChange(SK.customCalEvents, before, after, { t: 3, d: 'p' });
    expect(Object.keys(changed)).toEqual([portalSyncItemEntryId(SK.customCalEvents, 'b')]);
    expect(stampPortalSyncChange(SK.theme, 'dark', 'dark', { t: 3, d: 'p' })).toEqual({});
  });

  it('prunes old tombstones based on the doc itself, not the device clock', () => {
    const day = 24 * 60 * 60 * 1000;
    const doc: PortalSyncDoc = {
      old: { s: { t: 1, d: 'p' }, del: true },
      recent: { s: { t: 300 * day, d: 'p' }, del: true },
      [SK.theme]: { s: { t: 400 * day, d: 'p' }, v: 'dark' },
    };
    const pruned = prunePortalSyncTombstones(doc);
    expect(Object.keys(pruned).sort()).toEqual(['recent', SK.theme].sort());
    expect(portalSyncDocsEqual(prunePortalSyncTombstones(pruned), pruned)).toBe(true);
  });
});
