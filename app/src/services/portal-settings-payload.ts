/**
 * ポータル設定同期ペイロードの変換と旧形式の互換読み込み。
 *
 * API との入出力制御から純粋なデータ変換を分離し、旧版を読みつつ
 * 新規保存はコンパクト形式へ統一する。
 */

import { pickPortalSyncedStorage } from '../contract/portal-synced-storage';
import { SK } from '../contract/storage-keys';
import type { Settings } from '../domain/settings';
import {
  EMPTY_CUSTOM_THEMES,
  parseCustomThemeCollection,
  type StoredCustomThemeCollection,
} from '../domain/themes/custom-themes';
import { DEFAULT_UI_FONT, normalizeUiFont } from '../domain/ui-font';
import { DEFAULT_LANGUAGE, normalizeLanguage, type AppLanguage } from '../i18n/messages';
import { parseCalendarWeekStart, type CalendarWeekStart } from '../lib/date';
import {
  decodePortalSyncCompactPayload,
  encodePortalSyncCompactPayload,
} from '../lib/portal-sync-compact';
import {
  decryptPortalSyncPayload,
  encryptPortalSyncPayload,
  isEncryptedPortalSyncWire,
} from '../lib/portal-sync-crypto';

const PORTAL_EXTENSION_PAYLOAD_VERSION = 3 as const;
const PORTAL_SETTINGS_PAYLOAD_VERSION = 2 as const;

export interface PortalExtensionSnapshot {
  updatedAt: number;
  storage: Record<string, unknown>;
}

/** @deprecated settings コンテキスト互換 */
export interface PortalSettingsSnapshot {
  updatedAt: number;
  settings: Settings;
  customThemes: StoredCustomThemeCollection;
}

interface PortalExtensionPayloadV3 {
  version: typeof PORTAL_EXTENSION_PAYLOAD_VERSION;
  updatedAt: number;
  storage: Record<string, unknown>;
}

interface PortalSettingsPayloadV2 {
  version: typeof PORTAL_SETTINGS_PAYLOAD_VERSION;
  updatedAt: number;
  settings: Settings;
  customThemes: StoredCustomThemeCollection;
}

interface PortalSettingsPayloadLegacyV1 {
  v: 1;
  u: number;
  s: {
    t: string;
    h: 0 | 1;
    k: 0 | 1;
    c: 0 | 1;
    a: 0 | 1;
    w2: 0 | 1;
    cp: 0 | 1;
    w: CalendarWeekStart;
    l: AppLanguage;
  };
  ct: StoredCustomThemeCollection;
}

function fromBit(value: unknown, fallback: boolean): boolean {
  if (value === 1) return true;
  if (value === 0) return false;
  return fallback;
}

export function settingsFromPortalStorage(storageMap: Record<string, unknown>): Settings {
  return {
    theme: String(storageMap[SK.theme] ?? 'dark'),
    hideProfileName: Boolean(storageMap[SK.hideProfileName]),
    showKogiCalMascot: Boolean(storageMap[SK.showKogiCalMascot]),
    showHomeCornerCharacter: Boolean(storageMap[SK.showHomeCornerCharacter]),
    hideAssignmentCalendar: Boolean(storageMap[SK.hideAssignmentCalendar]),
    home2WebMailOverlay: storageMap[SK.home2WebMailOverlay] !== false,
    cplanOverlay: storageMap[SK.cplanOverlay] !== false,
    calendarWeekStart: parseCalendarWeekStart(storageMap[SK.calendarWeekStart]),
    language: normalizeLanguage(storageMap[SK.language] ?? DEFAULT_LANGUAGE),
    font: normalizeUiFont(storageMap[SK.font]),
  };
}

export function customThemesFromPortalStorage(
  storageMap: Record<string, unknown>,
): StoredCustomThemeCollection {
  return parseCustomThemeCollection(storageMap[SK.customThemes] ?? EMPTY_CUSTOM_THEMES);
}

function settingsSnapshotToStorage(snapshot: PortalSettingsSnapshot): Record<string, unknown> {
  return {
    [SK.theme]: snapshot.settings.theme,
    [SK.hideProfileName]: snapshot.settings.hideProfileName,
    [SK.showKogiCalMascot]: snapshot.settings.showKogiCalMascot,
    [SK.showHomeCornerCharacter]: snapshot.settings.showHomeCornerCharacter,
    [SK.hideAssignmentCalendar]: snapshot.settings.hideAssignmentCalendar,
    [SK.home2WebMailOverlay]: snapshot.settings.home2WebMailOverlay,
    [SK.cplanOverlay]: snapshot.settings.cplanOverlay,
    [SK.calendarWeekStart]: snapshot.settings.calendarWeekStart,
    [SK.language]: snapshot.settings.language,
    [SK.font]: snapshot.settings.font,
    [SK.customThemes]: snapshot.customThemes,
  };
}

export function defaultPortalSettingsStorage(): Record<string, unknown> {
  return settingsSnapshotToStorage({
    updatedAt: 0,
    settings: {
      theme: 'dark',
      hideProfileName: false,
      showKogiCalMascot: false,
      showHomeCornerCharacter: false,
      hideAssignmentCalendar: false,
      home2WebMailOverlay: true,
      cplanOverlay: true,
      calendarWeekStart: 'monday',
      language: DEFAULT_LANGUAGE,
      font: DEFAULT_UI_FONT,
    },
    customThemes: EMPTY_CUSTOM_THEMES,
  });
}

function decodeLegacyV1(raw: PortalSettingsPayloadLegacyV1): PortalExtensionSnapshot | null {
  if (!raw?.s || typeof raw.u !== 'number') return null;
  const s = raw.s;
  return {
    updatedAt: raw.u,
    storage: settingsSnapshotToStorage({
      updatedAt: raw.u,
      settings: {
        theme: typeof s.t === 'string' ? s.t : 'dark',
        hideProfileName: fromBit(s.h, false),
        showKogiCalMascot: fromBit(s.k, false),
        showHomeCornerCharacter: fromBit(s.c, false),
        hideAssignmentCalendar: fromBit(s.a, false),
        home2WebMailOverlay: fromBit(s.w2, true),
        cplanOverlay: fromBit(s.cp, true),
        calendarWeekStart: parseCalendarWeekStart(s.w),
        language: normalizeLanguage(s.l ?? DEFAULT_LANGUAGE),
        font: DEFAULT_UI_FONT,
      },
      customThemes: parseCustomThemeCollection(raw.ct ?? EMPTY_CUSTOM_THEMES),
    }),
  };
}

function decodeSettingsPayloadV2(raw: PortalSettingsPayloadV2): PortalExtensionSnapshot | null {
  if (raw.version !== PORTAL_SETTINGS_PAYLOAD_VERSION) return null;
  if (typeof raw.updatedAt !== 'number' || !raw.settings) return null;
  const s = raw.settings;
  return {
    updatedAt: raw.updatedAt,
    storage: settingsSnapshotToStorage({
      updatedAt: raw.updatedAt,
      settings: {
        theme: typeof s.theme === 'string' ? s.theme : 'dark',
        hideProfileName: Boolean(s.hideProfileName),
        showKogiCalMascot: Boolean(s.showKogiCalMascot),
        showHomeCornerCharacter: Boolean(s.showHomeCornerCharacter),
        hideAssignmentCalendar: Boolean(s.hideAssignmentCalendar),
        home2WebMailOverlay: s.home2WebMailOverlay !== false,
        cplanOverlay: s.cplanOverlay !== false,
        calendarWeekStart: parseCalendarWeekStart(s.calendarWeekStart),
        language: normalizeLanguage(s.language ?? DEFAULT_LANGUAGE),
        font: normalizeUiFont((s as { font?: unknown }).font),
      },
      customThemes: parseCustomThemeCollection(raw.customThemes ?? EMPTY_CUSTOM_THEMES),
    }),
  };
}

function decodePayload(json: string): PortalExtensionSnapshot | null {
  const compact = decodePortalSyncCompactPayload(json);
  if (compact) {
    return {
      updatedAt: compact.updatedAt,
      storage: pickPortalSyncedStorage(compact.storage),
    };
  }

  try {
    const raw = JSON.parse(json) as
      | PortalExtensionPayloadV3
      | PortalSettingsPayloadV2
      | PortalSettingsPayloadLegacyV1;
    if (!raw || typeof raw !== 'object') return null;

    if ('version' in raw && raw.version === PORTAL_EXTENSION_PAYLOAD_VERSION) {
      if (typeof raw.updatedAt !== 'number' || !raw.storage || typeof raw.storage !== 'object') {
        return null;
      }
      return {
        updatedAt: raw.updatedAt,
        storage: pickPortalSyncedStorage(raw.storage as Record<string, unknown>),
      };
    }

    if ('version' in raw && raw.version === PORTAL_SETTINGS_PAYLOAD_VERSION) {
      return decodeSettingsPayloadV2(raw as PortalSettingsPayloadV2);
    }

    if ('v' in raw && raw.v === 1) {
      return decodeLegacyV1(raw as PortalSettingsPayloadLegacyV1);
    }
  } catch {
    // 壊れたデータは同期元として扱わない。
  }
  return null;
}

export async function encodePortalSettingsPayloadWire(
  snapshot: PortalExtensionSnapshot,
): Promise<string> {
  const json = encodePortalSyncCompactPayload(
    snapshot.updatedAt,
    pickPortalSyncedStorage(snapshot.storage),
  );
  const encrypted = await encryptPortalSyncPayload(json);
  return encrypted ?? json;
}

export async function decodePortalSettingsPayloadWire(
  wire: string,
): Promise<PortalExtensionSnapshot | null> {
  if (!isEncryptedPortalSyncWire(wire)) return decodePayload(wire);
  const json = await decryptPortalSyncPayload(wire);
  return json ? decodePayload(json) : null;
}
