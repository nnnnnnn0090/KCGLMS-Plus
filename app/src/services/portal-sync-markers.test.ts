import { describe, expect, it } from 'vitest';
import { SK } from '../contract/storage-keys';
import type { PortalSyncDoc } from '../domain/portal-sync-doc';
import {
  isPortalSettingsMarkerLink,
  placePortalSyncMarkers,
  PORTAL_SETTINGS_BIKO_MAX,
  PORTAL_SETTINGS_MARKER_MAX,
  readPortalSyncMarkers,
  splitPortalSyncWire,
} from './portal-sync-markers';
import { encodePortalSyncWire } from './portal-sync-wire';
import type { PortalUserLink } from './user-html-link';

const USER_LINK: PortalUserLink = {
  id: 'user-1',
  version: 3,
  linkNo: 4,
  midashi: 'Library',
  url: 'https://example.com/library',
  biko: 'memo',
  order: 0,
  delFlg: false,
};

function doc(theme: string, t: number): PortalSyncDoc {
  return { [SK.theme]: { s: { t, d: 'dev' }, v: theme } };
}

async function rowsFor(value: PortalSyncDoc, rev: string, base: PortalUserLink[] = []) {
  const chunks = splitPortalSyncWire(await encodePortalSyncWire(value, { rev, space: 'space1' }));
  let id = 100;
  return placePortalSyncMarkers(base, chunks, rev).map((link) =>
    link.id ? link : { ...link, id: `m${(id += 1)}` },
  );
}

describe('portal sync markers', () => {
  it('detects settings marker links', () => {
    expect(isPortalSettingsMarkerLink({ midashi: '__KCGLMS::0', url: 'https://example.com' })).toBe(
      true,
    );
    expect(
      isPortalSettingsMarkerLink({
        midashi: 'x',
        url: 'https://home.kcg.ac.jp/portal/_kcglms/0/a/1',
      }),
    ).toBe(true);
    expect(isPortalSettingsMarkerLink(USER_LINK)).toBe(false);
  });

  it('round-trips a doc and leaves user links untouched', async () => {
    const links = await rowsFor(doc('ocean', 5), 'rev1', [USER_LINK]);
    expect(links.find((link) => link.id === 'user-1')).toEqual(USER_LINK);
    for (const link of links)
      expect(link.biko.length).toBeLessThanOrEqual(PORTAL_SETTINGS_BIKO_MAX);
    const read = await readPortalSyncMarkers(links);
    expect(read).toMatchObject({ kind: 'ok', space: 'space1', revs: ['rev1'], untidy: false });
    if (read.kind === 'ok') expect(read.doc[SK.theme]).toMatchObject({ v: 'ocean' });
  });

  it('gives new rows unique link numbers without renumbering existing links', async () => {
    const links = placePortalSyncMarkers([USER_LINK], ['a', 'b', 'c'], 'rev1');
    const markers = links.filter((link) => isPortalSettingsMarkerLink(link));
    expect(markers.map((link) => link.linkNo)).toEqual([5, 6, 7]);
    expect(links[0].linkNo).toBe(4);
  });

  it('reuses retired rows instead of piling up new ones', async () => {
    const first = await rowsFor(doc('ocean', 5), 'rev1');
    const retired = first.map((link) => ({ ...link, delFlg: true }));
    const second = placePortalSyncMarkers(retired, ['x'], 'rev2');
    expect(second.filter((link) => !link.id)).toHaveLength(0);
    expect(second.filter((link) => !link.delFlg)).toHaveLength(1);
  });

  it('ignores a generation whose rows are incomplete', async () => {
    const good = await rowsFor(doc('ocean', 5), 'good');
    const stray: PortalUserLink = {
      ...good[0],
      id: 'stray',
      url: 'https://home.kcg.ac.jp/portal/_kcglms/1/half/3',
      biko: 'garbage',
    };
    const read = await readPortalSyncMarkers([...good, stray]);
    expect(read).toMatchObject({ kind: 'ok', revs: ['good'], untidy: true });
  });

  it('merges every complete generation it finds', async () => {
    const a = await rowsFor(doc('ocean', 5), 'reva');
    const b = (await rowsFor(doc('forest', 9), 'revb')).map((link) => ({
      ...link,
      id: `${link.id}-b`,
    }));
    const read = await readPortalSyncMarkers([...a, ...b]);
    expect(read.kind).toBe('ok');
    if (read.kind === 'ok') {
      expect(read.doc[SK.theme]).toMatchObject({ v: 'forest' });
      expect(read.revs.sort()).toEqual(['reva', 'revb']);
    }
  });

  it('reports unreadable data instead of treating it as empty', async () => {
    const read = await readPortalSyncMarkers([
      {
        ...USER_LINK,
        id: 'x',
        midashi: '__KCGLMS::0',
        url: 'https://home.kcg.ac.jp/portal/_kcglms/0',
        biko: '~zz',
      },
    ]);
    expect(read).toEqual({ kind: 'unreadable' });
    expect(await readPortalSyncMarkers([USER_LINK])).toEqual({ kind: 'empty' });
  });

  it('rejects payloads that would need too many rows', () => {
    const chunks = Array.from({ length: PORTAL_SETTINGS_MARKER_MAX + 1 }, () => 'x');
    expect(() => placePortalSyncMarkers([], chunks, 'rev')).toThrow();
  });
});
