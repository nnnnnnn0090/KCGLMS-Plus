import { SK } from './storage-keys';

/** ポータル「マイリンク」へ同期する storage キー */
export const PORTAL_SYNCED_STORAGE_KEYS = [
  SK.hideProfileName,
  SK.theme,
  SK.customThemes,
  SK.customCalEvents,
  SK.customCalBandCollapsed,
  SK.showKogiCalMascot,
  SK.showHomeCornerCharacter,
  SK.hideAssignmentCalendar,
  SK.shortcutConfig,
  SK.portalGuidedTourDone,
  SK.portalLanguagePickerDone,
  SK.home2WebMailOverlay,
  SK.cplanOverlay,
  SK.calendarWeekStart,
  SK.language,
  SK.font,
  SK.extensionVersionSeen,
  SK.developerNoticeLang,
  SK.developerSurveyAnswered,
  SK.clientUserId,
  SK.communityDisclaimerAccepted,
] as const;

const PORTAL_SYNCED_KEY_SET = new Set<string>(PORTAL_SYNCED_STORAGE_KEYS);

export function isPortalSyncedStorageKey(key: string): boolean {
  return PORTAL_SYNCED_KEY_SET.has(key);
}

export function pickPortalSyncedStorage(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PORTAL_SYNCED_STORAGE_KEYS) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
}
