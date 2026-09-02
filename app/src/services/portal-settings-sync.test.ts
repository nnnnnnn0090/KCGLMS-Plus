import { describe, expect, it } from 'vitest';
import { SK } from '../contract/storage-keys';
import type { Settings } from '../domain/settings';
import { createCustomTheme, EMPTY_CUSTOM_THEMES } from '../domain/themes/custom-themes';
import { THEMES } from '../domain/themes/definitions';
import { PORTAL_SYNC_WIRE_PREFIX } from '../lib/portal-sync-crypto';
import {
  applyPortalExtensionMarkers,
  decodePortalExtensionSnapshot,
  decodePortalSettingsSnapshot,
  isPortalSettingsMarkerLink,
  PORTAL_SETTINGS_BIKO_MAX,
  PORTAL_SETTINGS_CHUNK_MAX,
  PORTAL_SETTINGS_MARKER_MAX,
  retireAllPortalExtensionMarkers,
} from './portal-settings-sync';
import type { PortalUserLink } from './user-html-link';

const BASE_SETTINGS: Settings = {
  theme: 'dark',
  hideProfileName: false,
  showKogiCalMascot: true,
  showHomeCornerCharacter: false,
  hideAssignmentCalendar: false,
  home2WebMailOverlay: true,
  cplanOverlay: false,
  calendarWeekStart: 'sunday',
  language: 'ja',
  font: 'default',
};

function extensionSnapshot(
  settings: Settings,
  extra: Record<string, unknown> = {},
  updatedAt = 1_700_000_000_000,
) {
  return {
    updatedAt,
    storage: {
      [SK.theme]: settings.theme,
      [SK.hideProfileName]: settings.hideProfileName,
      [SK.showKogiCalMascot]: settings.showKogiCalMascot,
      [SK.showHomeCornerCharacter]: settings.showHomeCornerCharacter,
      [SK.hideAssignmentCalendar]: settings.hideAssignmentCalendar,
      [SK.home2WebMailOverlay]: settings.home2WebMailOverlay,
      [SK.cplanOverlay]: settings.cplanOverlay,
      [SK.calendarWeekStart]: settings.calendarWeekStart,
      [SK.language]: settings.language,
      [SK.font]: settings.font,
      [SK.customThemes]: EMPTY_CUSTOM_THEMES,
      ...extra,
    },
  };
}

describe('portal-settings-sync', () => {
  it('detects settings marker links', () => {
    expect(isPortalSettingsMarkerLink({ midashi: '__KCGLMS::0', url: 'https://example.com' })).toBe(
      true,
    );
    expect(
      isPortalSettingsMarkerLink({
        midashi: 'My Link',
        url: 'https://home.kcg.ac.jp/portal/_kcglms/0',
      }),
    ).toBe(true);
    expect(isPortalSettingsMarkerLink({ midashi: 'My Link', url: 'https://example.com' })).toBe(
      false,
    );
  });

  it('round-trips extension storage through encrypted marker links', async () => {
    const links = await applyPortalExtensionMarkers([], extensionSnapshot(BASE_SETTINGS));
    const decoded = await decodePortalExtensionSnapshot(links);
    expect(decoded?.storage[SK.theme]).toBe('dark');
    expect(decoded?.storage[SK.showKogiCalMascot]).toBe(true);
    expect(decoded?.updatedAt).toBe(1_700_000_000_000);
    const joined = links.map((link) => link.biko).join('');
    expect(joined.startsWith(PORTAL_SYNC_WIRE_PREFIX)).toBe(true);
    expect(joined).not.toContain('"portalThemeColorTheme"');
  });

  it('round-trips onboarding flags in v3 storage', async () => {
    const links = await applyPortalExtensionMarkers(
      [],
      extensionSnapshot(BASE_SETTINGS, {
        [SK.portalGuidedTourDone]: true,
        [SK.portalLanguagePickerDone]: true,
      }),
    );
    const decoded = await decodePortalExtensionSnapshot(links);
    expect(decoded?.storage[SK.portalGuidedTourDone]).toBe(true);
    expect(decoded?.storage[SK.portalLanguagePickerDone]).toBe(true);
  });

  it('reads legacy v1 compact keys', async () => {
    const legacy = JSON.stringify({
      v: 1,
      u: 42,
      s: {
        t: 'dark',
        h: 1,
        k: 0,
        c: 0,
        a: 0,
        w2: 1,
        cp: 1,
        w: 'monday',
        l: 'ja',
      },
      ct: EMPTY_CUSTOM_THEMES,
    });
    const links: PortalUserLink[] = [
      {
        id: 'm0',
        version: 1,
        linkNo: 99,
        midashi: '__KCGLMS::0',
        url: 'https://home.kcg.ac.jp/portal/_kcglms/0',
        biko: legacy,
        order: 0,
        delFlg: false,
      },
    ];
    const decoded = await decodePortalSettingsSnapshot(links);
    expect(decoded?.updatedAt).toBe(42);
    expect(decoded?.settings.hideProfileName).toBe(true);
    expect(decoded?.settings.showKogiCalMascot).toBe(false);
  });

  it('preserves user links when saving settings markers', async () => {
    const userLink: PortalUserLink = {
      id: 'u1',
      version: 1,
      linkNo: 7,
      midashi: 'Example',
      url: 'https://example.com',
      biko: '',
      order: 0,
      delFlg: false,
    };
    const next = await applyPortalExtensionMarkers(
      [userLink],
      extensionSnapshot(BASE_SETTINGS, {}, 123),
    );
    expect(next.some((link) => link.id === 'u1' && link.linkNo === 7)).toBe(true);
    expect(next.some((link) => isPortalSettingsMarkerLink(link))).toBe(true);
  });

  it('assigns unique linkNo to new marker chunks without renumbering existing links', async () => {
    const userLink: PortalUserLink = {
      id: 'u1',
      version: 1,
      linkNo: 3,
      midashi: 'Example',
      url: 'https://example.com',
      biko: '',
      order: 0,
      delFlg: false,
    };
    const next = await applyPortalExtensionMarkers(
      [userLink],
      extensionSnapshot(BASE_SETTINGS, {}, 123),
    );
    const markers = next.filter((link) => isPortalSettingsMarkerLink(link) && !link.delFlg);
    expect(markers.every((link) => link.linkNo !== 3)).toBe(true);
    expect(new Set(markers.map((link) => link.linkNo)).size).toBe(markers.length);
    expect(next.find((link) => link.id === 'u1')?.linkNo).toBe(3);
  });

  it('splits default settings across biko chunks within portal limit', async () => {
    const links = await applyPortalExtensionMarkers([], extensionSnapshot(BASE_SETTINGS, {}, 999));
    const markers = links.filter((link) => isPortalSettingsMarkerLink(link) && !link.delFlg);
    expect(markers.length).toBe(1);
    for (const chunk of markers) {
      expect(chunk.biko.length).toBeLessThanOrEqual(PORTAL_SETTINGS_BIKO_MAX);
      expect(chunk.biko.length).toBeLessThanOrEqual(PORTAL_SETTINGS_CHUNK_MAX);
    }
  });

  it('splits large payloads across multiple biko chunks', async () => {
    const themes = Array.from({ length: 8 }, (_, index) =>
      createCustomTheme(`Theme ${index}`, 'dark', THEMES.dark),
    );
    const next = await applyPortalExtensionMarkers([], {
      updatedAt: 999,
      storage: {
        ...extensionSnapshot(BASE_SETTINGS).storage,
        [SK.customThemes]: { schemaVersion: 1, themes },
      },
    });
    const markers = next.filter((link) => isPortalSettingsMarkerLink(link) && !link.delFlg);
    expect(markers.length).toBeGreaterThan(1);
    for (const chunk of markers) {
      expect(chunk.biko.length).toBeLessThanOrEqual(PORTAL_SETTINGS_BIKO_MAX);
    }
    const decoded = await decodePortalExtensionSnapshot(next);
    expect(parseCustomThemes(decoded)).toHaveLength(8);
  });

  it('rejects payloads that would create too many marker links', async () => {
    let state = 0x12345678;
    const noise = (length: number) =>
      Array.from({ length }, () => {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;
        return String.fromCharCode(33 + (state % 90));
      }).join('');
    const now = new Date(0).toISOString();
    const events = Array.from({ length: 100 }, (_, index) => ({
      id: `event-${String(index).padStart(3, '0')}`,
      title: `Event ${index}`,
      note: noise(200),
      kind: 'once' as const,
      date: '2026-09-02',
      createdAt: now,
      updatedAt: now,
    }));

    await expect(
      applyPortalExtensionMarkers([], {
        updatedAt: 999,
        storage: {
          ...extensionSnapshot(BASE_SETTINGS).storage,
          [SK.customCalEvents]: { schemaVersion: 1, events },
        },
      }),
    ).rejects.toThrow(`/${PORTAL_SETTINGS_MARKER_MAX}`);
  });

  it('soft-deletes obsolete marker chunks', async () => {
    const themes = Array.from({ length: 8 }, (_, index) =>
      createCustomTheme(`Theme ${index}`, 'dark', THEMES.dark),
    );
    const initial = await applyPortalExtensionMarkers([], {
      updatedAt: 1,
      storage: {
        ...extensionSnapshot(BASE_SETTINGS).storage,
        [SK.customThemes]: { schemaVersion: 1, themes },
      },
    });
    expect(
      initial.filter((link) => isPortalSettingsMarkerLink(link) && !link.delFlg).length,
    ).toBeGreaterThan(1);

    const shrunk = await applyPortalExtensionMarkers(
      initial,
      extensionSnapshot(BASE_SETTINGS, {}, 2),
    );
    const shrunkActive = shrunk.filter((link) => isPortalSettingsMarkerLink(link) && !link.delFlg);
    const initialActive = initial.filter(
      (link) => isPortalSettingsMarkerLink(link) && !link.delFlg,
    );
    expect(shrunkActive.length).toBeLessThan(initialActive.length);
    expect(shrunk.some((link) => isPortalSettingsMarkerLink(link) && link.delFlg)).toBe(true);
  });

  it('retireAllPortalExtensionMarkers soft-deletes every settings marker and keeps user links', async () => {
    const userLink: PortalUserLink = {
      id: 'u1',
      version: '1',
      delFlg: false,
      linkNo: 1,
      midashi: 'Docs',
      url: 'https://example.com',
      biko: '',
      order: 0,
    };
    const withMarkers = await applyPortalExtensionMarkers(
      [userLink],
      extensionSnapshot(BASE_SETTINGS),
    );
    expect(withMarkers.some((link) => isPortalSettingsMarkerLink(link) && !link.delFlg)).toBe(true);

    const retired = retireAllPortalExtensionMarkers(withMarkers);
    expect(retired.find((link) => link.id === 'u1')?.delFlg).toBe(false);
    expect(
      retired.filter((link) => isPortalSettingsMarkerLink(link)).every((link) => link.delFlg),
    ).toBe(true);
  });

  it('reuses retired marker records instead of accumulating a new set after re-enabling sync', async () => {
    const active = await applyPortalExtensionMarkers([], extensionSnapshot(BASE_SETTINGS));
    const retired = retireAllPortalExtensionMarkers(active);
    const restored = await applyPortalExtensionMarkers(
      retired,
      extensionSnapshot({ ...BASE_SETTINGS, theme: 'light' }),
    );

    expect(restored).toHaveLength(active.length);
    expect(restored.every((link) => !link.delFlg)).toBe(true);
    expect(restored.map((link) => link.linkNo)).toEqual(active.map((link) => link.linkNo));
  });
});

function parseCustomThemes(
  decoded: Awaited<ReturnType<typeof decodePortalExtensionSnapshot>>,
): unknown[] {
  const raw = decoded?.storage[SK.customThemes];
  if (!raw || typeof raw !== 'object') return [];
  const themes = (raw as { themes?: unknown[] }).themes;
  return Array.isArray(themes) ? themes : [];
}
