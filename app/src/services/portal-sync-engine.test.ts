import { beforeEach, describe, expect, it } from 'vitest';
import { SK } from '../contract/storage-keys';
import {
  pickPortalSyncDocKeys,
  portalSyncDocToStorage,
  stampPortalSyncChange,
  type PortalSyncDoc,
} from '../domain/portal-sync-doc';
import type { PortalSyncLedgerMeta } from '../platform/storage/portal-sync-ledger';
import {
  deletePortalSyncRemote,
  runPortalSync,
  type PortalSyncIo,
  type PortalSyncMode,
} from './portal-sync-engine';
import { encodePortalSettingsPayloadWire } from './portal-settings-payload';
import { isPortalSettingsMarkerLink, splitPortalSyncWire } from './portal-sync-markers';
import { PortalUserLinksError, type PortalUserLink } from './user-html-link';

/** ポータルの「マイリンク」API の代わり（id 単位で上書き、新規行に id を振る） */
class FakePortal {
  rows: PortalUserLink[] = [];
  private nextId = 1;
  offline = false;

  async fetch(): Promise<PortalUserLink[]> {
    if (this.offline) throw new PortalUserLinksError('offline', 'network');
    return this.rows.map((row) => ({ ...row }));
  }

  async save(links: readonly PortalUserLink[]): Promise<void> {
    if (this.offline) throw new PortalUserLinksError('offline', 'network');
    for (const link of links) {
      if (!link.id) {
        if (link.delFlg) continue;
        this.rows.push({ ...link, id: `row-${this.nextId++}` });
        continue;
      }
      const index = this.rows.findIndex((row) => row.id === link.id);
      if (index >= 0) this.rows[index] = { ...link };
    }
  }

  activeMarkers(): PortalUserLink[] {
    return this.rows.filter((row) => !row.delFlg && isPortalSettingsMarkerLink(row));
  }
}

let clock = 1_800_000_000_000;
let idCounter = 0;

class FakeDevice {
  doc: PortalSyncDoc = {};
  backups: PortalSyncDoc[] = [];
  meta: PortalSyncLedgerMeta = { version: 1, space: null, adoptRemote: false, syncedClock: 0 };
  readonly io: PortalSyncIo;

  constructor(
    readonly name: string,
    readonly portal: FakePortal,
  ) {
    this.io = {
      fetchLinks: () => this.portal.fetch(),
      saveLinks: (links) => this.portal.save(links),
      withLock: (task) => task(),
      readLocal: async () => ({ doc: this.doc, meta: this.meta }),
      commitLocal: async (doc, keys) => {
        const keep = Object.fromEntries(
          Object.entries(this.doc).filter(([id]) => {
            return Object.keys(pickPortalSyncDocKeys({ [id]: this.doc[id] }, keys)).length === 0;
          }),
        );
        this.doc = { ...keep, ...pickPortalSyncDocKeys(doc, keys) };
      },
      backupLocal: async () => {
        this.backups.push(this.doc);
      },
      updateMeta: async (patch) => {
        this.meta = { ...this.meta, ...patch };
        return this.meta;
      },
      newId: () => `id${(idCounter += 1).toString(36)}`,
    };
  }

  value(key: string): unknown {
    return portalSyncDocToStorage(this.doc).values[key];
  }

  edit(key: string, next: unknown): void {
    clock += 1000;
    const entries = stampPortalSyncChange(key, this.value(key), next, { t: clock, d: this.name });
    this.doc = { ...this.doc, ...entries };
  }

  eventIds(): string[] {
    const value = this.value(SK.customCalEvents) as { events?: { id: string }[] } | undefined;
    return (value?.events ?? []).map((item) => item.id.replace(/^event-/, ''));
  }

  sync(mode: PortalSyncMode = 'normal') {
    return runPortalSync(this.io, mode);
  }
}

function calEvent(id: string, title: string) {
  const at = new Date(clock).toISOString();
  return {
    id: `event-${id}`,
    title,
    kind: 'once',
    date: '2026-11-01',
    createdAt: at,
    updatedAt: at,
  };
}

function withEvents(device: FakeDevice, ...items: ReturnType<typeof calEvent>[]) {
  const current = (device.value(SK.customCalEvents) as { events?: unknown[] } | undefined)?.events;
  return { schemaVersion: 1, events: [...(current ?? []), ...items] };
}

describe('portal sync engine', () => {
  let portal: FakePortal;
  let pc: FakeDevice;
  let phone: FakeDevice;

  beforeEach(() => {
    portal = new FakePortal();
    portal.rows.push({
      id: 'user-1',
      version: 1,
      linkNo: 1,
      midashi: 'My favourite site',
      url: 'https://example.com/',
      biko: '',
      order: 0,
      delFlg: false,
    });
    pc = new FakeDevice('pc', portal);
    phone = new FakeDevice('phone', portal);
  });

  it('keeps changes made to different settings on different devices', async () => {
    pc.edit(SK.theme, 'ocean');
    await pc.sync();
    await phone.sync();
    phone.edit(SK.language, 'en');
    pc.edit(SK.calendarWeekStart, 'sunday');
    await phone.sync();
    await pc.sync();
    await phone.sync();

    for (const device of [pc, phone]) {
      expect(device.value(SK.theme)).toBe('ocean');
      expect(device.value(SK.language)).toBe('en');
      expect(device.value(SK.calendarWeekStart)).toBe('sunday');
    }
  });

  it('keeps events added on both devices and propagates deletions', async () => {
    await pc.sync();
    await phone.sync();
    pc.edit(SK.customCalEvents, withEvents(pc, calEvent('a', 'Lab')));
    phone.edit(SK.customCalEvents, withEvents(phone, calEvent('b', 'Club')));
    await pc.sync();
    await phone.sync();
    await pc.sync();
    expect(pc.eventIds().sort()).toEqual(['a', 'b']);
    expect(phone.eventIds().sort()).toEqual(['a', 'b']);

    phone.edit(SK.customCalEvents, { schemaVersion: 1, events: [] });
    await phone.sync();
    await pc.sync();
    expect(pc.eventIds()).toEqual([]);
  });

  it('converges after two devices save at the same moment', async () => {
    await pc.sync();
    await phone.sync();
    pc.edit(SK.theme, 'forest');
    phone.edit(SK.customCalEvents, withEvents(phone, calEvent('p', 'Phone only')));

    // phone が取得してから保存するまでの間に、pc の同期が丸ごと割り込む。
    let interleaved = false;
    const save = phone.io.saveLinks;
    phone.io.saveLinks = async (links) => {
      if (!interleaved) {
        interleaved = true;
        await pc.sync();
      }
      await save(links);
    };
    await phone.sync();
    phone.io.saveLinks = save;

    await pc.sync();
    await phone.sync();
    for (const device of [pc, phone]) {
      expect(device.value(SK.theme)).toBe('forest');
      expect(device.eventIds()).toEqual(['p']);
    }
  });

  it('never touches the user’s normal links', async () => {
    pc.edit(SK.theme, 'ocean');
    await pc.sync();
    const userLink = portal.rows.find((row) => row.id === 'user-1');
    expect(userLink).toMatchObject({ midashi: 'My favourite site', delFlg: false });
    await deletePortalSyncRemote(pc.io);
    expect(portal.rows.find((row) => row.id === 'user-1')?.delFlg).toBe(false);
    expect(portal.activeMarkers()).toHaveLength(0);
  });

  it('does not change anything when the portal cannot be reached', async () => {
    pc.edit(SK.theme, 'ocean');
    portal.offline = true;
    const result = await pc.sync();
    expect(result).toMatchObject({ ok: false, issue: 'network' });
    expect(pc.value(SK.theme)).toBe('ocean');
    expect(pc.meta.syncedClock).toBe(0);
  });

  it('reports the real cause instead of a generic network error', async () => {
    portal.fetch = async () => {
      throw new PortalUserLinksError('load: HTTP 503', 'network', 503);
    };
    expect(await pc.sync()).toEqual({ ok: false, issue: 'network', detail: 'load: HTTP 503' });

    const broken = new FakeDevice('broken', new FakePortal());
    broken.io.readLocal = async () => {
      throw new TypeError('storage is unavailable');
    };
    expect(await broken.sync()).toEqual({
      ok: false,
      issue: 'unexpected',
      detail: 'TypeError: storage is unavailable',
    });
  });

  it('reports a rejected save with the portal’s message', async () => {
    pc.edit(SK.theme, 'ocean');
    portal.save = async () => {
      throw new PortalUserLinksError('save: HTTP 400 URL is too long', 'rejected', 400);
    };
    expect(await pc.sync()).toEqual({
      ok: false,
      issue: 'save-failed',
      detail: 'save: HTTP 400 URL is too long',
    });
  });

  it('refuses to overwrite sync data it cannot read', async () => {
    portal.rows.push({
      id: 'broken',
      version: 1,
      linkNo: 9,
      midashi: '__KCGLMS::0',
      url: 'https://home.kcg.ac.jp/portal/_kcglms/0',
      biko: '~not-decryptable',
      order: -1,
      delFlg: false,
    });
    pc.edit(SK.theme, 'ocean');
    expect(await pc.sync()).toEqual({ ok: false, issue: 'unreadable' });
    expect(portal.rows.find((row) => row.id === 'broken')?.biko).toBe('~not-decryptable');

    // 利用者が「この端末の内容で作り直す」を選んだときだけ上書きする。
    expect(await runPortalSync(pc.io, 'restart')).toMatchObject({ ok: true, wrote: true });
    await phone.sync();
    expect(phone.value(SK.theme)).toBe('ocean');
  });

  it('asks before recreating data that was deleted from another device', async () => {
    pc.edit(SK.theme, 'ocean');
    await pc.sync();
    await phone.sync();
    await deletePortalSyncRemote(phone.io);

    expect(await pc.sync()).toEqual({ ok: false, issue: 'remote-missing' });
    expect(portal.activeMarkers()).toHaveLength(0);
  });

  it('asks before replacing this device with another account’s data, and never leaks it', async () => {
    pc.edit(SK.theme, 'ocean');
    pc.edit(SK.customCalEvents, withEvents(pc, calEvent('mine', 'Private')));
    await pc.sync();

    const otherAccount = new FakePortal();
    const other = new FakeDevice('other', otherAccount);
    other.edit(SK.theme, 'forest');
    await other.sync();

    // 同じブラウザで別の学生がログインした。
    const shared = new FakeDevice('pc', otherAccount);
    shared.doc = pc.doc;
    shared.meta = pc.meta;
    expect(await shared.sync()).toMatchObject({
      ok: false,
      issue: 'needs-choice',
      choice: { kind: 'other-account' },
    });
    expect(shared.value(SK.theme)).toBe('ocean');
    expect(JSON.stringify(otherAccount.rows)).not.toContain('Private');

    await shared.sync('use-remote');
    expect(shared.value(SK.theme)).toBe('forest');
    expect(shared.eventIds()).toEqual([]);
    expect(JSON.stringify(otherAccount.rows)).not.toContain('Private');
    // 置き換える前の内容はバックアップに残っている。
    expect(shared.backups.at(-1)).toEqual(pc.doc);
  });

  it('asks which side to keep when a device with its own settings joins', async () => {
    pc.edit(SK.theme, 'ocean');
    await pc.sync();

    const laptop = new FakeDevice('laptop', portal);
    laptop.doc = {
      [SK.theme]: { s: { t: 0, d: '' }, v: 'sakura' },
      [`${SK.customCalEvents}\u001fevent-local`]: {
        s: { t: 0, d: '' },
        v: calEvent('local', 'Only on laptop'),
      },
    };
    expect(await laptop.sync()).toMatchObject({
      issue: 'needs-choice',
      choice: { kind: 'join', replaced: 1 },
    });
    expect(laptop.value(SK.theme)).toBe('sakura');

    // ポータルに合わせても、この端末にしかない予定は残る。
    await laptop.sync('use-remote');
    expect(laptop.value(SK.theme)).toBe('ocean');
    expect(laptop.eventIds()).toEqual(['local']);
    expect(laptop.backups).toHaveLength(1);
    await pc.sync();
    expect(pc.eventIds()).toEqual(['local']);
  });

  it('lets a joining device push its own settings to everyone', async () => {
    pc.edit(SK.theme, 'ocean');
    await pc.sync();
    const laptop = new FakeDevice('laptop', portal);
    laptop.doc = {
      [SK.theme]: { s: { t: 0, d: '' }, v: 'sakura' },
      [SK.language]: { s: { t: 0, d: '' }, v: 'en' },
    };
    expect(await laptop.sync()).toMatchObject({ issue: 'needs-choice' });
    await laptop.sync('use-local');
    await pc.sync();
    expect(pc.value(SK.theme)).toBe('sakura');
    expect(pc.value(SK.language)).toBe('en');
  });

  it('does not ask a brand-new device anything', async () => {
    pc.edit(SK.theme, 'ocean');
    await pc.sync();
    expect(await phone.sync()).toMatchObject({ ok: true });
    expect(phone.value(SK.theme)).toBe('ocean');
  });

  it('keeps unsent edits on other devices when sync data is rebuilt', async () => {
    pc.edit(SK.theme, 'ocean');
    await pc.sync();
    await phone.sync();
    portal.activeMarkers().forEach((row) => (row.biko = '~broken'));
    phone.edit(SK.customCalEvents, withEvents(phone, calEvent('p', 'Not sent yet')));

    await pc.sync('restart');
    expect(await phone.sync()).toMatchObject({ ok: true });
    expect(phone.eventIds()).toEqual(['p']);
    await pc.sync();
    expect(pc.eventIds()).toEqual(['p']);
  });

  it('keeps unsent edits on other devices when sync data is deleted and turned back on', async () => {
    pc.edit(SK.theme, 'ocean');
    await pc.sync();
    await phone.sync();
    await deletePortalSyncRemote(pc.io);
    phone.edit(SK.language, 'en');

    await pc.sync('resume');
    expect(await phone.sync()).toMatchObject({ ok: true });
    expect(phone.value(SK.language)).toBe('en');
    await pc.sync();
    expect(pc.value(SK.language)).toBe('en');
  });

  it('after migrating, prefers the portal over the cached copy but keeps new edits', async () => {
    pc.edit(SK.theme, 'ocean');
    pc.edit(SK.customCalEvents, withEvents(pc, calEvent('kept', 'Still there')));
    await pc.sync();

    const migrated = new FakeDevice('old', portal);
    migrated.meta = { ...migrated.meta, adoptRemote: true };
    migrated.doc = {
      [SK.theme]: { s: { t: 0, d: '' }, v: 'stale' },
      [`${SK.customCalEvents}\u001fevent-gone`]: {
        s: { t: 0, d: '' },
        v: calEvent('gone', 'Deleted elsewhere long ago'),
      },
    };
    migrated.edit(SK.language, 'ko');
    expect(await migrated.sync()).toMatchObject({ ok: true });
    expect(migrated.value(SK.theme)).toBe('ocean');
    expect(migrated.value(SK.language)).toBe('ko');
    expect(migrated.eventIds()).toEqual(['kept']);
    expect(migrated.backups).toHaveLength(1);
  });

  it('backs up before another device’s change overwrites this one', async () => {
    pc.edit(SK.theme, 'ocean');
    await pc.sync();
    await phone.sync();
    phone.edit(SK.theme, 'forest');
    await phone.sync();
    const before = pc.doc;
    await pc.sync();
    expect(pc.value(SK.theme)).toBe('forest');
    expect(pc.backups.at(-1)).toEqual(before);
  });

  it('reads data written by older versions and upgrades it in place', async () => {
    const wire = await encodePortalSettingsPayloadWire({
      updatedAt: clock - 10_000,
      storage: { [SK.theme]: 'sakura', [SK.language]: 'ko' },
    });
    splitPortalSyncWire(wire).forEach((biko, index) =>
      portal.rows.push({
        id: `legacy-${index}`,
        version: 1,
        linkNo: 10 + index,
        midashi: `__KCGLMS::${index}`,
        url: `https://home.kcg.ac.jp/portal/_kcglms/${index}`,
        biko,
        order: -1,
        delFlg: false,
      }),
    );
    pc.edit(SK.language, 'en');
    await pc.sync();
    expect(pc.value(SK.theme)).toBe('sakura');
    expect(pc.value(SK.language)).toBe('en');
    expect(portal.activeMarkers().every((row) => /\/_kcglms\/\d+\/\w+\/\d+$/.test(row.url))).toBe(
      true,
    );
  });

  it('reports what it received and sent', async () => {
    pc.edit(SK.theme, 'ocean');
    expect(await pc.sync()).toMatchObject({ ok: true, sent: { [SK.theme]: 1 } });
    phone.edit(SK.customCalEvents, withEvents(phone, calEvent('x', 'From phone')));
    expect(await phone.sync()).toMatchObject({
      ok: true,
      received: { [SK.theme]: 1 },
      sent: { [SK.customCalEvents]: 1 },
    });
    expect(await pc.sync()).toMatchObject({
      ok: true,
      received: { [SK.customCalEvents]: 1 },
      sent: {},
    });
  });

  it('does not write when nothing changed', async () => {
    pc.edit(SK.theme, 'ocean');
    expect(await pc.sync()).toMatchObject({ ok: true, wrote: true });
    expect(await pc.sync()).toMatchObject({ ok: true, wrote: false });
    expect(await phone.sync()).toMatchObject({ ok: true, wrote: false });
  });

  it('reports when the data does not fit in My Links', async () => {
    // 圧縮が効かないよう、ばらばらな文字列で埋める。
    let seed = 7;
    const noise = (length: number) =>
      Array.from({ length }, () => {
        seed = (seed * 48271) % 2147483647;
        return String.fromCharCode(0x4e00 + (seed % 2000));
      }).join('');
    const huge = Array.from({ length: 100 }, (_, i) => ({
      ...calEvent(`e${i}`, noise(80)),
      note: noise(200),
    }));
    pc.edit(SK.customCalEvents, { schemaVersion: 1, events: huge });
    const result = await pc.sync();
    expect(result).toMatchObject({ ok: false, issue: 'over-capacity' });
    expect(pc.eventIds()).toHaveLength(100);
    expect(portal.activeMarkers()).toHaveLength(0);
  });
});
