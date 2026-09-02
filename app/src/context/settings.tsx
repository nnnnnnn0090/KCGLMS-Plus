/**
 * 設定の React コンテキスト。
 * 端末キャッシュを即時利用し、ポータル上ではマイリンクとも同期する。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { SK } from '../shared/constants';
import storage from '../lib/storage';
import { syncPortalTheme } from '../domain/themes';
import { syncPortalFont } from '../domain/ui-font';
import {
  EMPTY_CUSTOM_THEMES,
  type CustomTheme,
  type StoredCustomThemeCollection,
} from '../domain/themes/custom-themes';
import { DEFAULT_SETTINGS, type Settings } from '../domain/settings';
import { PORTAL_SYNCED_STORAGE_KEYS } from '../contract/portal-synced-storage';
import {
  ensurePortalExtensionBootstrapped,
  parseCustomThemesFromExtensionStorage,
  parseSettingsFromExtensionStorage,
} from '../services/portal-settings-sync';

export type { Settings };

export interface SettingsContextValue {
  settings: Settings;
  settingsReady: boolean;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  updateTheme: (name: string) => void;
  customThemes: StoredCustomThemeCollection;
  saveCustomTheme: (theme: CustomTheme) => void;
  deleteCustomTheme: (id: string) => void;
}

const DEFAULTS: Settings = { ...DEFAULT_SETTINGS };

const SETTINGS_TO_SK = {
  theme: SK.theme,
  hideProfileName: SK.hideProfileName,
  showKogiCalMascot: SK.showKogiCalMascot,
  showHomeCornerCharacter: SK.showHomeCornerCharacter,
  hideAssignmentCalendar: SK.hideAssignmentCalendar,
  home2WebMailOverlay: SK.home2WebMailOverlay,
  cplanOverlay: SK.cplanOverlay,
  calendarWeekStart: SK.calendarWeekStart,
  language: SK.language,
  font: SK.font,
} satisfies Record<keyof Settings, string>;

function parseSettings(data: Record<string, unknown>): Settings {
  return parseSettingsFromExtensionStorage(data);
}

function loadUiStateFromStorage(data: Record<string, unknown>): {
  settings: Settings;
  customThemes: StoredCustomThemeCollection;
} {
  return {
    settings: parseSettings(data),
    customThemes: parseCustomThemesFromExtensionStorage(data),
  };
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [customThemes, setCustomThemes] =
    useState<StoredCustomThemeCollection>(EMPTY_CUSTOM_THEMES);
  const customThemesRef = useMemo(() => ({ current: customThemes }), [customThemes]);
  customThemesRef.current = customThemes;

  const applyStorageToUi = useCallback((data: Record<string, unknown>) => {
    const next = loadUiStateFromStorage(data);
    setSettings(next.settings);
    setCustomThemes(next.customThemes);
    syncPortalTheme(next.settings.theme, next.customThemes);
    syncPortalFont(next.settings.font);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await ensurePortalExtensionBootstrapped();
      if (cancelled) return;

      const stored = await storage.get([...PORTAL_SYNCED_STORAGE_KEYS]);
      if (cancelled) return;
      applyStorageToUi(stored);

      if (!cancelled) setSettingsReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [applyStorageToUi]);

  const updateSetting = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      if (key === 'font') syncPortalFont(value as Settings['font']);
      await storage.set({ [SETTINGS_TO_SK[key]]: value });
    },
    [],
  );

  const updateTheme = useCallback(
    (name: string) => {
      void updateSetting('theme', name);
      syncPortalTheme(name, customThemesRef.current);
    },
    [updateSetting, customThemesRef],
  );

  const saveCustomTheme = useCallback((theme: CustomTheme) => {
    setCustomThemes((previous) => {
      const themes = previous.themes.some((item) => item.id === theme.id)
        ? previous.themes.map((item) => (item.id === theme.id ? theme : item))
        : [...previous.themes, theme];
      const next = { schemaVersion: 1 as const, themes };
      void storage.set({ [SK.customThemes]: next });
      return next;
    });
  }, []);

  const deleteCustomTheme = useCallback((id: string) => {
    setCustomThemes((previous) => {
      const next = {
        schemaVersion: 1 as const,
        themes: previous.themes.filter((theme) => theme.id !== id),
      };
      void storage.set({ [SK.customThemes]: next });
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      settings,
      settingsReady,
      updateSetting,
      updateTheme,
      customThemes,
      saveCustomTheme,
      deleteCustomTheme,
    }),
    [
      settings,
      settingsReady,
      updateSetting,
      updateTheme,
      customThemes,
      saveCustomTheme,
      deleteCustomTheme,
    ],
  );

  return (
    <SettingsContext.Provider value={value}>
      {settingsReady ? children : null}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings は SettingsProvider の中で使ってください');
  return ctx;
}
