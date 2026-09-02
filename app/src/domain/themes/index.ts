/**
 * テーマ管理モジュールです。
 * CSS カスタムプロパティ文字列の生成と、`#portal-overlay` への適用を担います。
 */

import { CPLAN_RUNTIME_STYLE_KEY, PORTAL_DOM } from '../../contract/dom';
import { ZINDEX } from '../../contract/zindex';
import { upsertRuntimeCss } from '../../platform/runtime-css';
import { THEMES, DEFAULT_THEME } from './definitions';
import type { ThemeTokens } from './theme-tokens';
import {
  EMPTY_CUSTOM_THEMES,
  resolveThemeTokens,
  type StoredCustomThemeCollection,
} from './custom-themes';

export { THEMES, DEFAULT_THEME, type ThemeTokens };
export * from './custom-themes';

function avatarRingColor(background: string): '#000' | '#fff' {
  const hex = background.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return '#fff';
  const normalized = hex.length === 3 ? [...hex].map((value) => value + value).join('') : hex;
  const [red, green, blue] = [0, 2, 4].map((offset) =>
    Number.parseInt(normalized.slice(offset, offset + 2), 16),
  );
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.55 ? '#000' : '#fff';
}

// ─── CSS 生成 ─────────────────────────────────────────────────────────────

/** テーマトークンを `#portal-overlay` スコープ用の CSS カスタムプロパティ文字列へ変換します。 */
export function getThemeCss(t: ThemeTokens): string {
  return (
    `#${PORTAL_DOM.overlayRoot}{` +
    `--p-bg:${t.bg};--p-bg2:${t.bgSecondary};--p-bg3:${t.bgTertiary};--p-bg-hover:${t.bgHover};` +
    `--p-border:${t.border};--p-border-light:${t.borderLight};--p-border-hover:${t.borderHover};` +
    `--p-text:${t.text};--p-text-muted:${t.textMuted};--p-text-dim:${t.textDim};` +
    `--p-text-dimmer:${t.textDimmer};--p-text-bright:${t.textBright};` +
    `--p-accent:${t.accent};--p-accent-light:${t.accentLight};` +
    `--p-accent-bg:${t.accentBg};--p-accent-border:${t.accentBorder};` +
    `--p-on-accent:${t.onAccent};--p-avatar-ring:${avatarRingColor(t.bg)};` +
    `--p-danger:${t.danger};--p-danger-hover:${t.dangerHover};` +
    `--p-shadow:${t.shadow};--p-shadow-strong:${t.shadowStrong};background:${t.bg}}`
  );
}

export function themeTokensForName(
  name: string,
  customThemes: StoredCustomThemeCollection = EMPTY_CUSTOM_THEMES,
): ThemeTokens {
  return resolveThemeTokens(name, customThemes);
}

/** オーバーレイ用変数に加え、ホスト面と起動カバーの背景まで含めた runtime CSS 文字列です。 */
export function portalHeadThemeCss(t: ThemeTokens): string {
  return (
    `${getThemeCss(t)}` +
    `html.kcg-portal-surface,body.kcg-portal-surface{background-color:${t.bg};overflow:hidden}` +
    `#${PORTAL_DOM.bootCover}{position:fixed;inset:0;z-index:${PORTAL_BACKDROP_Z};pointer-events:none;` +
    `margin:0;padding:0;border:0;width:100%;height:100%;background:${t.bg}}`
  );
}

export function portalHeadThemeCssByName(
  name: string,
  customThemes: StoredCustomThemeCollection = EMPTY_CUSTOM_THEMES,
): string {
  const key = name.trim();
  return portalHeadThemeCss(themeTokensForName(key || DEFAULT_THEME, customThemes));
}

/** 起動カバーの背景色（テーマが確定するまでのフラッシュ防止） */
export function bootCoverBg(
  themeName?: string,
  customThemes: StoredCustomThemeCollection = EMPTY_CUSTOM_THEMES,
): string {
  return themeTokensForName(themeName ?? '', customThemes).bg;
}

const PORTAL_BACKDROP_Z = ZINDEX.portalBackdrop;

/**
 * オーバーレイ直下の固定背景。オーバースクロールのバウンド時にホストページが見えないようにする。
 * 起動時のブートカバー（`#kcg-portal-boot-cover`）をマウント後も残して使う。
 */
export function ensurePortalBackdrop(
  themeName?: string,
  customThemes: StoredCustomThemeCollection = EMPTY_CUSTOM_THEMES,
): void {
  const overlay = document.getElementById(PORTAL_DOM.overlayRoot);
  let el = document.getElementById(PORTAL_DOM.bootCover) as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = PORTAL_DOM.bootCover;
    el.className =
      'tw-fixed tw-inset-0 tw-z-boot-cover tw-pointer-events-none tw-m-0 tw-h-full tw-w-full tw-border-0 tw-p-0';
    el.setAttribute('aria-hidden', 'true');
  }
  if (themeName != null) {
    upsertRuntimeCss(
      PORTAL_DOM.headThemeStyle,
      portalHeadThemeCss(themeTokensForName(themeName, customThemes)),
    );
  }

  const parent = document.body ?? document.documentElement;
  if (overlay?.parentElement === parent) {
    parent.insertBefore(el, overlay);
  } else if (!el.parentElement) {
    parent.appendChild(el);
  }
}

export function removePortalBackdrop(): void {
  document.getElementById(PORTAL_DOM.bootCover)?.remove();
}

/** 固定シェル `#portal-overlay` と、その内側スクロール容器を body に追加する */
export function appendPortalOverlayShell(): { overlay: HTMLElement; scroller: HTMLElement } {
  const overlay = document.createElement('div');
  overlay.id = PORTAL_DOM.overlayRoot;
  const scroller = document.createElement('div');
  scroller.className = 'p-overlay-scroller';
  overlay.appendChild(scroller);
  document.body.appendChild(overlay);
  return { overlay, scroller };
}

function syncDocumentSurfaceBg(bg: string): void {
  void bg;
  document.documentElement.classList.add('kcg-portal-surface');
  document.body?.classList.add('kcg-portal-surface');
}

// ─── テーマ適用 ────────────────────────────────────────────────────────────

/**
 * Runtime CSS に CSS 変数を書き込みます。
 * 任意のユーザー作成テーマ色は build-time class にできないため、この関数に集約します。
 */
export function applyThemeToElement(el: HTMLElement, t: ThemeTokens): void {
  void el;
  upsertRuntimeCss(PORTAL_DOM.headThemeStyle, portalHeadThemeCss(t));
}

/**
 * Runtime CSS と `#portal-overlay` の両方へテーマを反映します。
 * React のマウント前後を問わず同じ関数で呼べます。
 */
export function syncPortalTheme(
  name: string,
  customThemes: StoredCustomThemeCollection = EMPTY_CUSTOM_THEMES,
): void {
  syncPortalThemeTokens(themeTokensForName(name, customThemes));
}

export function syncPortalThemeTokens(t: ThemeTokens): void {
  upsertRuntimeCss(PORTAL_DOM.headThemeStyle, portalHeadThemeCss(t));
  const overlay = document.getElementById(PORTAL_DOM.overlayRoot) as HTMLElement | null;
  if (overlay) {
    applyThemeToElement(overlay, t);
  }
  syncDocumentSurfaceBg(t.bg);
  ensurePortalBackdrop();
}

export function syncCplanSurfaceRuntime(): void {
  upsertRuntimeCss(
    CPLAN_RUNTIME_STYLE_KEY,
    `html.kcg-portal-surface,body.kcg-portal-surface{background-color:#111111;overflow:hidden}` +
      `#${PORTAL_DOM.overlayRoot}.p-surface-cplan{background:#111111}` +
      `#${PORTAL_DOM.bootCover}{position:fixed;inset:0;z-index:${PORTAL_BACKDROP_Z};` +
      'pointer-events:none;margin:0;padding:0;border:0;width:100%;height:100%;background:#111111}',
  );
  syncDocumentSurfaceBg('#111111');
}
