/**
 * キー毎の型付き storage アクセサ（§10.2）。
 */

import { INSTALL_OPEN_PENDING_KEY, SK } from '../../contract/storage-keys';
import { storageClient } from './client';
import {
  parseCalendarWeekStart,
  parseCustomThemes,
  parseDeveloperNoticeLang,
  parseDeveloperSurveyAnswered,
  parseKingLmsAssignmentDue,
  parseKingLmsCourses,
  parseLanguage,
  parseOptionalString,
  parseShortcutConfig,
  parseStorageBool,
  parseThemeId,
  parseUiFont,
  parseSyncViaMyLinks,
  type CalendarWeekStart,
  type KingLmsAssignmentDuePayload,
  type KingLmsCourseEntry,
  type ShortcutConfig,
} from './parsers';
import type { StoredCustomThemeCollection } from '../../domain/themes/custom-themes';
import type { AppLanguage } from '../../domain/i18n/messages';
import type { UiFont } from '../../domain/ui-font';

type KeyListener = (value: unknown) => void;
const keyListeners = new Map<string, Set<KeyListener>>();

let unsubscribeGlobal: (() => void) | null = null;

function ensureGlobalListener(): void {
  if (unsubscribeGlobal) return;
  unsubscribeGlobal = storageClient.onChanged((changes, area) => {
    if (area !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
      const listeners = keyListeners.get(key);
      if (!listeners) continue;
      for (const listener of listeners) listener(change.newValue);
    }
  });
}

export function subscribeStorageKey(key: string, listener: KeyListener): () => void {
  ensureGlobalListener();
  let set = keyListeners.get(key);
  if (!set) {
    set = new Set();
    keyListeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) keyListeners.delete(key);
  };
}

async function readKey<T>(key: string, parse: (raw: unknown) => T): Promise<T> {
  const snap = await storageClient.get(key);
  return parse(snap[key]);
}

async function writeKey(key: string, value: unknown): Promise<void> {
  await storageClient.set({ [key]: value });
}

export const storageRepo = {
  getHideProfileName: () =>
    readKey(SK.hideProfileName, (r) => parseStorageBool(SK.hideProfileName, r)),
  setHideProfileName: (v: boolean) => writeKey(SK.hideProfileName, v),

  getTheme: () => readKey(SK.theme, parseThemeId),
  setTheme: (v: string) => writeKey(SK.theme, v),

  getCustomThemes: () => readKey(SK.customThemes, parseCustomThemes),
  setCustomThemes: (v: StoredCustomThemeCollection) => writeKey(SK.customThemes, v),

  getShowKogiCalMascot: () =>
    readKey(SK.showKogiCalMascot, (r) => parseStorageBool(SK.showKogiCalMascot, r)),
  setShowKogiCalMascot: (v: boolean) => writeKey(SK.showKogiCalMascot, v),

  getShowHomeCornerCharacter: () =>
    readKey(SK.showHomeCornerCharacter, (r) => parseStorageBool(SK.showHomeCornerCharacter, r)),
  setShowHomeCornerCharacter: (v: boolean) => writeKey(SK.showHomeCornerCharacter, v),

  getHideAssignmentCalendar: () =>
    readKey(SK.hideAssignmentCalendar, (r) => parseStorageBool(SK.hideAssignmentCalendar, r)),
  setHideAssignmentCalendar: (v: boolean) => writeKey(SK.hideAssignmentCalendar, v),

  getKingLmsCourses: () => readKey(SK.kingLmsCourses, parseKingLmsCourses),
  setKingLmsCourses: (v: KingLmsCourseEntry[]) => writeKey(SK.kingLmsCourses, v),

  getKingLmsAssignmentDue: () => readKey(SK.kingLmsAssignmentDue, parseKingLmsAssignmentDue),
  setKingLmsAssignmentDue: (v: KingLmsAssignmentDuePayload) => writeKey(SK.kingLmsAssignmentDue, v),

  getKingLmsSyncPending: () =>
    readKey(SK.kingLmsSyncPending, (r) => parseStorageBool(SK.kingLmsSyncPending, r)),
  setKingLmsSyncPending: (v: boolean) => writeKey(SK.kingLmsSyncPending, v),

  getKingLmsSyncReturnUrl: () => readKey(SK.kingLmsSyncReturnUrl, parseOptionalString),
  setKingLmsSyncReturnUrl: (v: string | undefined) =>
    v ? writeKey(SK.kingLmsSyncReturnUrl, v) : storageClient.remove(SK.kingLmsSyncReturnUrl),

  getKingLmsSyncAwaitCourse: () =>
    readKey(SK.kingLmsSyncAwaitCourse, (r) => parseStorageBool(SK.kingLmsSyncAwaitCourse, r)),
  setKingLmsSyncAwaitCourse: (v: boolean) => writeKey(SK.kingLmsSyncAwaitCourse, v),

  getKingLmsCourseSyncToastQuiet: () =>
    readKey(SK.kingLmsCourseSyncToastQuiet, (r) =>
      parseStorageBool(SK.kingLmsCourseSyncToastQuiet, r),
    ),
  setKingLmsCourseSyncToastQuiet: (v: boolean) => writeKey(SK.kingLmsCourseSyncToastQuiet, v),

  getKingLmsAssignmentSyncPending: () =>
    readKey(SK.kingLmsAssignmentSyncPending, (r) =>
      parseStorageBool(SK.kingLmsAssignmentSyncPending, r),
    ),
  setKingLmsAssignmentSyncPending: (v: boolean) => writeKey(SK.kingLmsAssignmentSyncPending, v),

  getKingLmsAssignmentSyncReturnUrl: () =>
    readKey(SK.kingLmsAssignmentSyncReturnUrl, parseOptionalString),
  setKingLmsAssignmentSyncReturnUrl: (v: string | undefined) =>
    v
      ? writeKey(SK.kingLmsAssignmentSyncReturnUrl, v)
      : storageClient.remove(SK.kingLmsAssignmentSyncReturnUrl),

  getKingLmsAssignmentSyncAwaitCalendar: () =>
    readKey(SK.kingLmsAssignmentSyncAwaitCalendar, (r) =>
      parseStorageBool(SK.kingLmsAssignmentSyncAwaitCalendar, r),
    ),
  setKingLmsAssignmentSyncAwaitCalendar: (v: boolean) =>
    writeKey(SK.kingLmsAssignmentSyncAwaitCalendar, v),

  getPortalScrollToAssignmentOnce: () =>
    readKey(SK.portalScrollToAssignmentOnce, (r) =>
      parseStorageBool(SK.portalScrollToAssignmentOnce, r),
    ),
  setPortalScrollToAssignmentOnce: (v: boolean) => writeKey(SK.portalScrollToAssignmentOnce, v),

  getShortcutConfig: () => readKey(SK.shortcutConfig, parseShortcutConfig),
  setShortcutConfig: (v: ShortcutConfig) => writeKey(SK.shortcutConfig, v),

  getPortalGuidedTourDone: () =>
    readKey(SK.portalGuidedTourDone, (r) => parseStorageBool(SK.portalGuidedTourDone, r)),
  setPortalGuidedTourDone: (v: boolean) => writeKey(SK.portalGuidedTourDone, v),

  getPortalLanguagePickerDone: () =>
    readKey(SK.portalLanguagePickerDone, (r) => parseStorageBool(SK.portalLanguagePickerDone, r)),
  setPortalLanguagePickerDone: (v: boolean) => writeKey(SK.portalLanguagePickerDone, v),

  getHome2WebMailOverlay: () =>
    readKey(SK.home2WebMailOverlay, (r) => parseStorageBool(SK.home2WebMailOverlay, r)),
  setHome2WebMailOverlay: (v: boolean) => writeKey(SK.home2WebMailOverlay, v),

  getCplanOverlay: () => readKey(SK.cplanOverlay, (r) => parseStorageBool(SK.cplanOverlay, r)),
  setCplanOverlay: (v: boolean) => writeKey(SK.cplanOverlay, v),

  getCalendarWeekStart: () => readKey(SK.calendarWeekStart, parseCalendarWeekStart),
  setCalendarWeekStart: (v: CalendarWeekStart) => writeKey(SK.calendarWeekStart, v),

  getLanguage: () => readKey(SK.language, parseLanguage),
  setLanguage: (v: AppLanguage) => writeKey(SK.language, v),

  getFont: () => readKey(SK.font, parseUiFont),
  setFont: (v: UiFont) => writeKey(SK.font, v),

  getSyncViaMyLinks: () => readKey(SK.syncViaMyLinks, parseSyncViaMyLinks),
  setSyncViaMyLinks: (v: boolean) => writeKey(SK.syncViaMyLinks, v),

  getExtensionVersionSeen: () => readKey(SK.extensionVersionSeen, parseOptionalString),
  setExtensionVersionSeen: (v: string) => writeKey(SK.extensionVersionSeen, v),

  getDeveloperNoticeLang: async () => {
    const snap = await storageClient.get([SK.language, SK.developerNoticeLang]);
    const language = parseLanguage(snap[SK.language]);
    return parseDeveloperNoticeLang(snap[SK.developerNoticeLang], language);
  },
  setDeveloperNoticeLang: (v: AppLanguage) => writeKey(SK.developerNoticeLang, v),

  getDeveloperSurveyAnswered: () =>
    readKey(SK.developerSurveyAnswered, parseDeveloperSurveyAnswered),
  setDeveloperSurveyAnswered: (v: string[]) => writeKey(SK.developerSurveyAnswered, v),

  getClientUserId: () => readKey(SK.clientUserId, parseOptionalString),
  setClientUserId: (v: string) => writeKey(SK.clientUserId, v),

  getClientInstallAt: () => readKey(SK.clientInstallAt, parseOptionalString),
  setClientInstallAt: (v: string) => writeKey(SK.clientInstallAt, v),

  getClientLastUpdatedAt: () => readKey(SK.clientLastUpdatedAt, parseOptionalString),
  setClientLastUpdatedAt: (v: string) => writeKey(SK.clientLastUpdatedAt, v),

  getClientLastKnownVersion: () => readKey(SK.clientLastKnownVersion, parseOptionalString),
  setClientLastKnownVersion: (v: string) => writeKey(SK.clientLastKnownVersion, v),

  getCommunityDisclaimerAccepted: () =>
    readKey(SK.communityDisclaimerAccepted, (r) =>
      parseStorageBool(SK.communityDisclaimerAccepted, r),
    ),
  setCommunityDisclaimerAccepted: (v: boolean) => writeKey(SK.communityDisclaimerAccepted, v),

  getInstallOpenPending: () =>
    readKey(INSTALL_OPEN_PENDING_KEY, (r) => parseStorageBool(INSTALL_OPEN_PENDING_KEY, r)),
  setInstallOpenPending: (v: boolean) => writeKey(INSTALL_OPEN_PENDING_KEY, v),
  clearInstallOpenPending: () => storageClient.remove(INSTALL_OPEN_PENDING_KEY),
};

export default storageRepo;
