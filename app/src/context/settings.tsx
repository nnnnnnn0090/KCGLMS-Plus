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
  useRef,
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

/** 設定画面・テーマに関わる storage キー（これ以外の同期キーの変更では描き直さない） */
const UI_STORAGE_KEYS: ReadonlySet<string> = new Set([
  ...Object.values(SETTINGS_TO_SK),
  SK.customThemes,
]);

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

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

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // 同期で他の端末の変更が届いたとき・別タブで変えたときも、表示を最新に保つ。
  // 自分の書き込みや値の変わらない通知（Firefox は同じ値でも通知する）では何もしない。
  // 画面全体の描き直しとテーマ CSS の差し替えは重いので、実際に変わったときだけ行う。
  useEffect(() => {
    if (!settingsReady) return;
    let scheduled = false;

    const applyIfChanged = (data: Record<string, unknown>) => {
      const next = loadUiStateFromStorage(data);
      const sameSettings = sameJson(next.settings, settingsRef.current);
      const sameThemes = sameJson(next.customThemes, customThemesRef.current);
      if (sameSettings && sameThemes) return;
      const themeChanged = !sameThemes || next.settings.theme !== settingsRef.current.theme;
      const fontChanged = next.settings.font !== settingsRef.current.font;
      if (!sameSettings) setSettings(next.settings);
      if (!sameThemes) setCustomThemes(next.customThemes);
      if (themeChanged) syncPortalTheme(next.settings.theme, next.customThemes);
      if (fontChanged) syncPortalFont(next.settings.font);
    };

    return storage.onChanged((changes) => {
      const relevant = Object.entries(changes).some(
        ([key, change]) => UI_STORAGE_KEYS.has(key) && !sameJson(change.oldValue, change.newValue),
      );
      if (!relevant || scheduled) return;
      // 続けて届いた通知は1回の読み直しにまとめる。
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        void storage.get([...UI_STORAGE_KEYS]).then(applyIfChanged);
      }, 0);
    });
  }, [settingsReady, customThemesRef]);

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
