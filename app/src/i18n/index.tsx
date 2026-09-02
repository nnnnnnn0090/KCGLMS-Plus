import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useSettings } from '../context/settings';
import {
  localeForLanguage,
  messagesForLanguage,
  normalizeLanguage,
  type AppLanguage,
  type I18nMessages,
} from './messages';

export type { AppLanguage, I18nMessages } from './messages';
export {
  APP_LANGUAGES,
  APP_LANGUAGE_LABELS,
  DEFAULT_LANGUAGE,
  detectDefaultLanguage,
  localeForLanguage,
  messagesForLanguage,
  normalizeLanguage,
  themeDisplayName,
} from './messages';

export interface I18nContextValue {
  language: AppLanguage;
  locale: string;
  t: I18nMessages;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const language = normalizeLanguage(settings.language);
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale: localeForLanguage(language),
      t: messagesForLanguage(language),
    }),
    [language],
  );

  useEffect(() => {
    const tag = language === 'zh_TW' ? 'zh-Hant' : language.replace('_', '-');
    try {
      document.documentElement.lang = tag;
    } catch {
      /* ignore */
    }
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
