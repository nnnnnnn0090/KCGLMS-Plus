import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../../../../context/settings';
import {
  CUSTOM_THEME_SCHEMA_VERSION,
  THEME_TOKEN_KEYS,
  THEMES,
  createCustomTheme,
  customThemeRef,
  editableTokens,
  isSafeThemeValue,
  parseColor,
  parseCustomThemeCollection,
  resolveThemeTokens,
  syncPortalTheme,
  syncPortalThemeTokens,
  type CustomTheme,
  type EditableThemeTokens,
} from '../../../../domain/themes';
import { useI18n } from '../../../../i18n';
import { DEFAULT_THEME } from '../../../../domain/themes/definitions';

const TOKEN_GROUPS: { labelJa: string; labelEn: string; keys: (keyof EditableThemeTokens)[] }[] = [
  { labelJa: '背景', labelEn: 'Backgrounds', keys: ['bg', 'bgSecondary', 'bgTertiary', 'bgHover'] },
  { labelJa: '境界線', labelEn: 'Borders', keys: ['border', 'borderLight', 'borderHover'] },
  {
    labelJa: '文字',
    labelEn: 'Text',
    keys: ['text', 'textMuted', 'textDim', 'textDimmer', 'textBright'],
  },
  {
    labelJa: 'アクセント',
    labelEn: 'Accent',
    keys: ['accent', 'onAccent', 'accentLight', 'accentBg', 'accentBorder'],
  },
  { labelJa: '警告・危険', labelEn: 'Danger', keys: ['danger', 'dangerHover'] },
  { labelJa: '影', labelEn: 'Shadows', keys: ['shadow', 'shadowStrong'] },
];

function hexForPicker(value: string): string {
  const rgb = parseColor(value);
  if (!rgb) return '#000000';
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((n) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function downloadTheme(theme: CustomTheme): void {
  const blob = new Blob(
    [JSON.stringify({ schemaVersion: CUSTOM_THEME_SCHEMA_VERSION, themes: [theme] }, null, 2)],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${theme.name.replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'custom-theme'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface ThemeStudioProps {
  theme?: CustomTheme;
  baseRef: string;
  onClose: () => void;
}

export function ThemeStudio({ theme, baseRef, onClose }: ThemeStudioProps) {
  const { language } = useI18n();
  const ja = language === 'ja';
  const { settings, customThemes, saveCustomTheme, updateTheme } = useSettings();
  const originalRef = useRef(settings.theme);
  const baseTokens = useMemo(
    () =>
      theme
        ? resolveThemeTokens(customThemeRef(theme.id), customThemes)
        : resolveThemeTokens(baseRef, customThemes),
    [baseRef, customThemes, theme],
  );
  const initial = useMemo(() => editableTokens(baseTokens), [baseTokens]);
  const [name, setName] = useState(
    theme?.name ?? (ja ? `${baseTokens.name} カスタム` : `${baseTokens.name} custom`),
  );
  const [tokens, setTokens] = useState<EditableThemeTokens>(initial);
  const [showImport, setShowImport] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [error, setError] = useState('');
  const [saveAsNew, setSaveAsNew] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const backgroundTouchYRef = useRef<number | null>(null);
  const dirty =
    name !== (theme?.name ?? (ja ? `${baseTokens.name} カスタム` : `${baseTokens.name} custom`)) ||
    THEME_TOKEN_KEYS.some((key) => tokens[key] !== initial[key]);

  const requestClose = useCallback(() => {
    if (
      dirty &&
      !window.confirm(ja ? '保存していない変更を破棄しますか？' : 'Discard unsaved changes?')
    )
      return;
    syncPortalTheme(originalRef.current, customThemes);
    onClose();
  }, [customThemes, dirty, ja, onClose]);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('input')?.focus();
  }, []);
  useEffect(() => {
    syncPortalThemeTokens({ name, ...tokens });
  }, [name, tokens]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
      if (event.key !== 'Tab' || !panelRef.current) return;
      const nodes = [
        ...panelRef.current.querySelectorAll<HTMLElement>('button,input,textarea'),
      ].filter((node) => !node.hasAttribute('disabled'));
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [requestClose]);
  const save = () => {
    if (!name.trim()) {
      setError(ja ? 'テーマ名を入力してください。' : 'Enter a theme name.');
      return;
    }
    if (THEME_TOKEN_KEYS.some((key) => !isSafeThemeValue(tokens[key]))) {
      setError(ja ? '使用できない色の値があります。' : 'Some color values are invalid.');
      return;
    }
    const now = new Date().toISOString();
    const next =
      theme && !saveAsNew
        ? { ...theme, name: name.trim().slice(0, 50), tokens, updatedAt: now }
        : {
            ...createCustomTheme(name, THEMES[baseRef] ? baseRef : DEFAULT_THEME, {
              name,
              ...tokens,
            }),
            tokens,
          };
    saveCustomTheme(next);
    updateTheme(customThemeRef(next.id));
    syncPortalThemeTokens({ name: next.name, ...next.tokens });
    onClose();
  };
  const importJson = (raw: string) => {
    try {
      const parsed = parseCustomThemeCollection(JSON.parse(raw));
      const imported = parsed.themes[0];
      if (!imported) throw new Error('invalid');
      setName(imported.name);
      setTokens(imported.tokens);
      setSaveAsNew(true);
      setShowImport(false);
      setError('');
    } catch {
      setError(ja ? 'テーマコードを読み込めませんでした。' : 'Could not read the theme code.');
    }
  };
  const importFile = async (file: File) => {
    try {
      importJson(await file.text());
    } catch {
      setError(ja ? 'テーマファイルを読み込めませんでした。' : 'Could not import the theme file.');
    }
  };

  const scrollBackgroundBy = (deltaY: number) => {
    const scroller = document.querySelector<HTMLElement>('#portal-overlay .p-overlay-scroller');
    scroller?.scrollBy({ top: deltaY, left: 0, behavior: 'auto' });
  };

  return createPortal(
    <div
      id="p-theme-studio-root"
      className="p-theme-studio-root"
      role="presentation"
      onWheel={(event) => {
        if (panelRef.current?.contains(event.target as Node)) return;
        event.preventDefault();
        scrollBackgroundBy(event.deltaY);
      }}
      onTouchStart={(event) => {
        if (panelRef.current?.contains(event.target as Node)) return;
        backgroundTouchYRef.current = event.touches[0]?.clientY ?? null;
      }}
      onTouchMove={(event) => {
        if (panelRef.current?.contains(event.target as Node)) return;
        const currentY = event.touches[0]?.clientY;
        const previousY = backgroundTouchYRef.current;
        if (currentY == null || previousY == null) return;
        event.preventDefault();
        scrollBackgroundBy(previousY - currentY);
        backgroundTouchYRef.current = currentY;
      }}
      onTouchEnd={() => {
        backgroundTouchYRef.current = null;
      }}
    >
      <aside
        ref={panelRef}
        className="p-theme-studio"
        role="dialog"
        aria-modal="true"
        aria-labelledby="p-theme-studio-title"
      >
        <header className="p-theme-studio-head">
          <div>
            <span>{ja ? '実画面でプレビュー中' : 'Live preview'}</span>
            <h2 id="p-theme-studio-title">{ja ? '独自テーマを編集' : 'Edit custom theme'}</h2>
          </div>
          <button type="button" onClick={requestClose} aria-label={ja ? '閉じる' : 'Close'}>
            ×
          </button>
        </header>
        <div className="p-theme-studio-scroll">
          <label className="p-theme-name-field">
            <span>{ja ? 'テーマ名' : 'Theme name'}</span>
            <input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
          </label>
          {TOKEN_GROUPS.map((group) => (
            <section className="p-theme-token-group" key={group.labelEn}>
              <h3>{ja ? group.labelJa : group.labelEn}</h3>
              {group.keys.map((key) => (
                <div className="p-theme-token-row" key={key}>
                  <label>
                    <span>{key}</span>
                    <span className="p-theme-token-controls">
                      <input
                        type="color"
                        value={hexForPicker(tokens[key])}
                        aria-label={`${key} color`}
                        onChange={(e) => {
                          const value = e.target.value;
                          setTokens((prev) => ({ ...prev, [key]: value }));
                        }}
                      />
                      <input
                        value={tokens[key]}
                        aria-invalid={!isSafeThemeValue(tokens[key])}
                        onChange={(e) => {
                          const value = e.target.value;
                          setTokens((prev) => ({ ...prev, [key]: value }));
                        }}
                        onBlur={() => {
                          if (!isSafeThemeValue(tokens[key]))
                            setTokens((prev) => ({ ...prev, [key]: initial[key] }));
                        }}
                      />
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={tokens[key] === initial[key]}
                    onClick={() => setTokens((prev) => ({ ...prev, [key]: initial[key] }))}
                  >
                    {ja ? '戻す' : 'Reset'}
                  </button>
                </div>
              ))}
            </section>
          ))}
          <section className="p-theme-import-export">
            <button type="button" onClick={() => fileRef.current?.click()}>
              {ja ? 'JSONから読み込む' : 'Import JSON'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
                event.target.value = '';
              }}
            />
            <button type="button" onClick={() => setShowImport((v) => !v)}>
              {ja ? 'テーマコードを読み込む' : 'Import theme code'}
            </button>
            {theme ? (
              <>
                <button type="button" onClick={() => downloadTheme({ ...theme, name, tokens })}>
                  {ja ? 'JSONを書き出す' : 'Export JSON'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard?.writeText(
                      JSON.stringify({ schemaVersion: 1, themes: [{ ...theme, name, tokens }] }),
                    )
                  }
                >
                  {ja ? 'コードをコピー' : 'Copy code'}
                </button>
              </>
            ) : null}
            {showImport ? (
              <div className="p-theme-import-code">
                <textarea
                  value={importCode}
                  onChange={(e) => setImportCode(e.target.value)}
                  placeholder="{ ... }"
                />
                <button type="button" onClick={() => importJson(importCode)}>
                  {ja ? '読み込む' : 'Import'}
                </button>
              </div>
            ) : null}
          </section>
          {error ? (
            <p className="p-theme-studio-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="p-theme-studio-footer">
          <button type="button" onClick={requestClose}>
            {ja ? 'キャンセル' : 'Cancel'}
          </button>
          <button type="button" className="is-primary" onClick={save}>
            {ja ? '保存して使用' : 'Save and use'}
          </button>
        </footer>
      </aside>
    </div>,
    document.getElementById('portal-overlay') ?? document.body,
  );
}

export { downloadTheme };
