/**
 * storage キー毎のパーサ（§4.6.1）。
 * パース失敗時は既定値を返し、storage へ書き戻さない。
 */

import { APP_LANGUAGES, DEFAULT_LANGUAGE, type AppLanguage } from '../../domain/i18n/messages';
import type { DueItem } from '../../ui/calendar/assignment';
import {
  EMPTY_CUSTOM_THEMES,
  parseCustomThemeCollection,
  type StoredCustomThemeCollection,
} from '../../domain/themes/custom-themes';
import { normalizeUiFont, type UiFont } from '../../domain/ui-font';
import { INSTALL_OPEN_PENDING_KEY, SK } from '../../contract/storage-keys';
import { isRecord, parseBool, parseString, parseStringArray } from '../../contract/validation-core';

export type CalendarWeekStart = 'monday' | 'sunday';

export interface ShortcutCustomLink {
  id: string;
  midashi: string;
  url: string;
}

export interface ShortcutConfig {
  order: string[];
  hidden: string[];
  custom: ShortcutCustomLink[];
}

export interface KingLmsCourseEntry {
  displayName: string | null;
  externalAccessUrl: string | null;
}

export interface KingLmsAssignmentDuePayload {
  items: DueItem[];
  capturedAt: string;
}

const BOOL_DEFAULTS = {
  [SK.hideProfileName]: false,
  [SK.showKogiCalMascot]: true,
  [SK.showHomeCornerCharacter]: true,
  [SK.hideAssignmentCalendar]: false,
  [SK.kingLmsSyncPending]: false,
  [SK.kingLmsSyncAwaitCourse]: false,
  [SK.kingLmsCourseSyncToastQuiet]: false,
  [SK.kingLmsAssignmentSyncPending]: false,
  [SK.kingLmsAssignmentSyncAwaitCalendar]: false,
  [SK.portalScrollToAssignmentOnce]: false,
  [SK.portalGuidedTourDone]: false,
  [SK.portalLanguagePickerDone]: false,
  [SK.home2WebMailOverlay]: true,
  [SK.cplanOverlay]: true,
  [SK.communityDisclaimerAccepted]: false,
  [INSTALL_OPEN_PENDING_KEY]: false,
} as const;

export function parseStorageBool(key: keyof typeof BOOL_DEFAULTS, raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  return BOOL_DEFAULTS[key];
}

export function parseThemeId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return 'dark';
  return raw.trim();
}

export function parseCustomThemes(raw: unknown): StoredCustomThemeCollection {
  return parseCustomThemeCollection(raw);
}

export function parseCalendarWeekStart(raw: unknown): CalendarWeekStart {
  return raw === 'sunday' ? 'sunday' : 'monday';
}

export function parseLanguage(raw: unknown): AppLanguage {
  return typeof raw === 'string' && (APP_LANGUAGES as readonly string[]).includes(raw)
    ? (raw as AppLanguage)
    : DEFAULT_LANGUAGE;
}

export function parseUiFont(raw: unknown): UiFont {
  return normalizeUiFont(raw);
}

/** 未設定・不正値は true（既存ユーザー互換） */
export function parseSyncViaMyLinks(raw: unknown): boolean {
  return raw !== false;
}

export function parseDeveloperNoticeLang(raw: unknown, languageFallback: AppLanguage): AppLanguage {
  if (typeof raw === 'string' && (APP_LANGUAGES as readonly string[]).includes(raw)) {
    return raw as AppLanguage;
  }
  return languageFallback;
}

export function parseDeveloperSurveyAnswered(raw: unknown): string[] {
  return parseStringArray(raw);
}

export function parseOptionalString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

export function parseKingLmsCourses(raw: unknown): KingLmsCourseEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: KingLmsCourseEntry[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    out.push({
      displayName: entry.displayName != null ? String(entry.displayName) : null,
      externalAccessUrl: entry.externalAccessUrl != null ? String(entry.externalAccessUrl) : null,
    });
  }
  return out.length > 0 ? out : undefined;
}

export function parseKingLmsAssignmentDue(raw: unknown): KingLmsAssignmentDuePayload | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return undefined;
  const capturedAt = typeof raw.capturedAt === 'string' ? raw.capturedAt : undefined;
  if (!capturedAt) return undefined;
  const items: DueItem[] = [];
  for (const item of raw.items) {
    if (!isRecord(item)) continue;
    items.push({
      courseId: item.courseId as string | number | undefined,
      courseName: typeof item.courseName === 'string' ? item.courseName : undefined,
      title: typeof item.title === 'string' ? item.title : undefined,
      dueDate: typeof item.dueDate === 'string' ? item.dueDate : undefined,
      sourceId: typeof item.sourceId === 'string' ? item.sourceId : undefined,
      submitted: typeof item.submitted === 'boolean' ? item.submitted : undefined,
    });
  }
  return { items, capturedAt };
}

export function parseShortcutConfig(raw: unknown): ShortcutConfig | undefined {
  if (!isRecord(raw)) return undefined;
  const order = Array.isArray(raw.order)
    ? raw.order.filter((id): id is string => typeof id === 'string')
    : [];
  const hidden = Array.isArray(raw.hidden)
    ? raw.hidden.filter((id): id is string => typeof id === 'string')
    : [];
  const custom: ShortcutCustomLink[] = [];
  if (Array.isArray(raw.custom)) {
    for (const entry of raw.custom) {
      if (!isRecord(entry)) continue;
      const id = typeof entry.id === 'string' ? entry.id : '';
      const midashi = typeof entry.midashi === 'string' ? entry.midashi : '';
      const url = typeof entry.url === 'string' ? entry.url : '';
      if (id && midashi && url) custom.push({ id, midashi, url });
    }
  }
  if (order.length === 0 && hidden.length === 0 && custom.length === 0) return undefined;
  return { order, hidden, custom };
}

export { EMPTY_CUSTOM_THEMES };
