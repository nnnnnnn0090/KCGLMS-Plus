/**
 * 拡張 UI フォント設定（設定パネル・マイリンク同期・オーバーレイ適用）。
 * Google Fonts 由来の日本語向け UI フォントを選択可能。
 */

import { PORTAL_DOM } from '../contract/dom';
import { upsertRuntimeCss } from '../platform/runtime-css';

const JP_FALLBACK =
  "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', Meiryo, sans-serif";

const UI_FONT_DEF_LIST = [
  {
    id: 'default',
    label: 'Default',
    stack: `'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    // 既定のフォントではなくなったので、同期でも省略せず明示する（旧版は未知の値を default として読む）。
    compact: 'd',
    googleFamily: undefined,
  },
  {
    id: 'zen-maru-gothic',
    label: 'Zen Maru Gothic',
    stack: `'Zen Maru Gothic', ${JP_FALLBACK}`,
    compact: 'z',
    googleFamily: 'Zen+Maru+Gothic:wght@400;500;700',
  },
  {
    id: 'noto-sans-jp',
    label: 'Noto Sans JP',
    stack: `'Noto Sans JP', ${JP_FALLBACK}`,
    compact: 'n',
    googleFamily: 'Noto+Sans+JP:wght@400;500;700',
  },
  {
    id: 'mplus-rounded-1c',
    label: 'M PLUS Rounded 1c',
    stack: `'M PLUS Rounded 1c', ${JP_FALLBACK}`,
    compact: 'r',
    googleFamily: 'M+PLUS+Rounded+1c:wght@400;500;700',
  },
  {
    id: 'zen-kaku-gothic-new',
    label: 'Zen Kaku Gothic New',
    stack: `'Zen Kaku Gothic New', ${JP_FALLBACK}`,
    compact: 'k',
    googleFamily: 'Zen+Kaku+Gothic+New:wght@400;500;700',
  },
  {
    id: 'biz-udpgothic',
    label: 'BIZ UDPGothic',
    stack: `'BIZ UDPGothic', ${JP_FALLBACK}`,
    compact: 'b',
    googleFamily: 'BIZ+UDPGothic:wght@400;700',
  },
  {
    id: 'ibm-plex-sans-jp',
    label: 'IBM Plex Sans JP',
    stack: `'IBM Plex Sans JP', ${JP_FALLBACK}`,
    compact: 'p',
    googleFamily: 'IBM+Plex+Sans+JP:wght@400;500;700',
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  stack: string;
  compact: string | undefined;
  googleFamily: string | undefined;
}>;

export const UI_FONTS = UI_FONT_DEF_LIST.map((d) => d.id);
export type UiFont = (typeof UI_FONT_DEF_LIST)[number]['id'];

/** 新規インストールの既定フォント */
export const DEFAULT_UI_FONT: UiFont = 'mplus-rounded-1c';

/** 既定が変わる前（〜7.1）の既定フォント。旧形式のデータや既存の利用者に使う */
export const LEGACY_DEFAULT_UI_FONT: UiFont = 'default';

const DEF_BY_ID = Object.fromEntries(UI_FONT_DEF_LIST.map((d) => [d.id, d])) as Record<
  UiFont,
  (typeof UI_FONT_DEF_LIST)[number]
>;

const ID_BY_COMPACT = Object.fromEntries(
  UI_FONT_DEF_LIST.filter((d) => d.compact).map((d) => [d.compact as string, d.id]),
) as Record<string, UiFont>;

export const UI_FONT_STACK: Record<UiFont, string> = Object.fromEntries(
  UI_FONT_DEF_LIST.map((d) => [d.id, d.stack]),
) as Record<UiFont, string>;

/** 設定セレクト用（default 以外は Google Font の正式名） */
export const UI_FONT_OPTIONS: ReadonlyArray<{ id: UiFont; label: string }> = UI_FONT_DEF_LIST.map(
  (d) => ({ id: d.id, label: d.label }),
);

export function normalizeUiFont(value: unknown): UiFont {
  return typeof value === 'string' && value in DEF_BY_ID ? (value as UiFont) : DEFAULT_UI_FONT;
}

/** マイリンク短縮値 */
export function compactUiFont(value: unknown): string | undefined {
  const id = normalizeUiFont(value);
  return DEF_BY_ID[id].compact;
}

/** 短縮値またはフル id から復元 */
export function expandUiFont(value: unknown): UiFont {
  if (typeof value !== 'string' || !value) return DEFAULT_UI_FONT;
  if (value in DEF_BY_ID) return value as UiFont;
  return ID_BY_COMPACT[value] ?? DEFAULT_UI_FONT;
}

function googleCssHref(familyQuery: string): string {
  return `https://fonts.googleapis.com/css2?family=${familyQuery}&display=swap`;
}

const RUNTIME_CSS_ID = 'portal-ui-font';
const GOOGLE_FONTS_LINK_ID = 'portal-ui-font-google';
const GOOGLE_FONTS_PRECONNECT_ID = 'portal-ui-font-google-preconnect';
const GOOGLE_FONTS_GSTATIC_ID = 'portal-ui-font-google-gstatic';

function ensureGoogleFontStylesheet(familyQuery: string | undefined): void {
  if (typeof document === 'undefined') return;
  const head = document.head ?? document.documentElement;
  if (!head) return;

  const removeById = (id: string) => {
    document.getElementById(id)?.remove();
  };

  if (!familyQuery) {
    removeById(GOOGLE_FONTS_LINK_ID);
    removeById(GOOGLE_FONTS_PRECONNECT_ID);
    removeById(GOOGLE_FONTS_GSTATIC_ID);
    return;
  }

  if (!document.getElementById(GOOGLE_FONTS_PRECONNECT_ID)) {
    const preconnect = document.createElement('link');
    preconnect.id = GOOGLE_FONTS_PRECONNECT_ID;
    preconnect.rel = 'preconnect';
    preconnect.href = 'https://fonts.googleapis.com';
    head.appendChild(preconnect);
  }
  if (!document.getElementById(GOOGLE_FONTS_GSTATIC_ID)) {
    const gstatic = document.createElement('link');
    gstatic.id = GOOGLE_FONTS_GSTATIC_ID;
    gstatic.rel = 'preconnect';
    gstatic.href = 'https://fonts.gstatic.com';
    gstatic.crossOrigin = 'anonymous';
    head.appendChild(gstatic);
  }

  const href = googleCssHref(familyQuery);
  let link = document.getElementById(GOOGLE_FONTS_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = GOOGLE_FONTS_LINK_ID;
    link.rel = 'stylesheet';
    head.appendChild(link);
  }
  if (link.href !== href) {
    link.href = href;
  }
}

const PREVIEW_LINK_ID = 'portal-ui-font-preview';

/**
 * フォントを選ぶ画面で、すべての候補を見比べられるように読み込む。
 * 戻り値を呼ぶと読み込みをやめる。
 */
export function loadUiFontPreviews(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const families = UI_FONT_DEF_LIST.flatMap((d) => (d.googleFamily ? [d.googleFamily] : []));
  const head = document.head ?? document.documentElement;
  if (!head || families.length === 0 || document.getElementById(PREVIEW_LINK_ID)) {
    return () => undefined;
  }
  const link = document.createElement('link');
  link.id = PREVIEW_LINK_ID;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
  head.appendChild(link);
  return () => link.remove();
}

/**
 * `#portal-overlay` の `--p-font` を更新し、必要なら Google Fonts を読み込む。
 * React マウント前後どちらからでも呼べる。
 */
export function syncPortalFont(font: UiFont | unknown): void {
  if (typeof document === 'undefined') return;
  const resolved = normalizeUiFont(font);
  const def = DEF_BY_ID[resolved];
  upsertRuntimeCss(RUNTIME_CSS_ID, `#${PORTAL_DOM.overlayRoot}{--p-font:${def.stack}}`);
  const overlay = document.getElementById(PORTAL_DOM.overlayRoot) as HTMLElement | null;
  if (overlay) {
    overlay.style.setProperty('--p-font', def.stack);
  }
  ensureGoogleFontStylesheet(def.googleFamily);
}
