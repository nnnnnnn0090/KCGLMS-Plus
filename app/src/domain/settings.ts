import { DEFAULT_LANGUAGE, detectDefaultLanguage, type AppLanguage } from './i18n/messages';
import type { CalendarWeekStart } from '../platform/storage/parsers';
import { DEFAULT_UI_FONT, type UiFont } from './ui-font';
import { DEFAULT_THEME } from './themes/definitions';

/** 設定パネル項目のドメインモデル（§4.6.2） */
export interface Settings {
  theme: string;
  hideProfileName: boolean;
  showKogiCalMascot: boolean;
  showHomeCornerCharacter: boolean;
  hideAssignmentCalendar: boolean;
  home2WebMailOverlay: boolean;
  cplanOverlay: boolean;
  calendarWeekStart: CalendarWeekStart;
  language: AppLanguage;
  font: UiFont;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME,
  hideProfileName: false,
  showKogiCalMascot: false,
  showHomeCornerCharacter: false,
  hideAssignmentCalendar: false,
  home2WebMailOverlay: true,
  cplanOverlay: true,
  calendarWeekStart: 'monday',
  language: DEFAULT_LANGUAGE,
  font: DEFAULT_UI_FONT,
};

export function resolveInitialLanguage(stored: unknown): AppLanguage {
  if (typeof stored === 'string') return stored as AppLanguage;
  return detectDefaultLanguage();
}
