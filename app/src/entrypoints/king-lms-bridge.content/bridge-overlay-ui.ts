/**
 * 同期中の全画面オーバーレイ、ログイン案内バー、およびスクロール固定の表示・解除です。
 */

import { isLoginRedirectPage } from './bridge-urls';
import { messagesForLanguage, type AppLanguage } from '../../i18n/messages';
import { upsertRuntimeCss } from '../../platform/runtime-css';
import { parseCustomThemes, parseThemeId } from '../../platform/storage/parsers';
import { resolveThemeTokens } from '../../domain/themes/custom-themes';
import { DEFAULT_THEME, THEMES } from '../../domain/themes/definitions';
import type { ThemeTokens } from '../../domain/themes/theme-tokens';
import { SK } from '../../shared/constants';
import mascotUrl from '../../assets/mascot-icon-144.webp';

const OVERLAY_ID = 'kcg-portal-ext-sync-overlay';
const LOGIN_HINT_ID = 'kcg-portal-ext-login-hint';
const STYLE_ID = 'kcg-portal-ext-sync-overlay-style';
const THEME_STYLE_ID = 'kcg-portal-ext-sync-overlay-theme';

/** オーバーレイの配色に使う設定キー（呼び出し側の storage.get にまとめて渡す） */
export const SYNC_OVERLAY_THEME_KEYS = [SK.theme, SK.customThemes] as const;

/** storage.get の結果から利用者のテーマを解決する（ポータル側と同じテーマで覆う） */
export function syncOverlayThemeFrom(data: Record<string, unknown>): ThemeTokens {
  return resolveThemeTokens(parseThemeId(data[SK.theme]), parseCustomThemes(data[SK.customThemes]));
}

let scrollLocked = false;

/** オーバーレイより先に届いた段階表示（hooks は document_start から動くため） */
let earlyStepMessage: string | null = null;

function lockScroll(): void {
  if (scrollLocked) return;
  scrollLocked = true;
  document.documentElement.classList.add('kcg-portal-ext-scroll-locked');
  document.body?.classList.add('kcg-portal-ext-scroll-locked');
}

function unlockScroll(): void {
  if (!scrollLocked) return;
  scrollLocked = false;
  document.documentElement.classList.remove('kcg-portal-ext-scroll-locked');
  document.body?.classList.remove('kcg-portal-ext-scroll-locked');
}

const O = `#${OVERLAY_ID}`;

/**
 * アプリ版の取り込み画面（テーマ背景・跳ねるマスコット・細い進捗バー・一行の案内）に揃えた見た目。
 * 色は `--kx-*` 変数で受け、テーマごとの値は `applyOverlayTheme` が別シートで差し替える。
 */
function ensureUiStyles(): void {
  upsertRuntimeCss(
    STYLE_ID,
    'html.kcg-portal-ext-scroll-locked,body.kcg-portal-ext-scroll-locked{overflow:hidden}' +
      // しゃがむ → 伸びて跳ぶ → 着地でつぶれる（アプリの PlayfulMascot と同じ 620ms の一跳ね）
      '@keyframes kcg-portal-ext-hop{' +
      '0%{transform:translateY(0) scale(1,1)}' +
      '8%{transform:translateY(0) scale(1.11,.86)}' +
      '15%{transform:translateY(0) scale(1,1)}' +
      '47%{transform:translateY(-13px) scale(.95,1.06)}' +
      '80%{transform:translateY(0) scale(1,1)}' +
      '90%{transform:translateY(0) scale(1.06,.93)}' +
      '100%{transform:translateY(0) scale(1,1)}}' +
      // Flutter の LinearProgressIndicator（不確定）と同じ動き。1.8 秒周期で 2 本のバーが流れ、
      // それぞれ先頭（右端）と末尾（左端）が別の区間・曲線で進む（区間はミリ秒 / 1800）。
      '@keyframes kcg-portal-ext-bar1-head{' +
      '0%{right:100%;animation-timing-function:cubic-bezier(.2,0,.8,1)}' +
      '41.667%,100%{right:0}}' +
      '@keyframes kcg-portal-ext-bar1-tail{' +
      '0%{left:0}18.5%{left:0;animation-timing-function:cubic-bezier(.4,0,1,1)}' +
      '60.167%,100%{left:100%}}' +
      '@keyframes kcg-portal-ext-bar2-head{' +
      '0%{right:100%}55.556%{right:100%;animation-timing-function:cubic-bezier(0,0,.65,1)}' +
      '87.056%,100%{right:0}}' +
      '@keyframes kcg-portal-ext-bar2-tail{' +
      '0%{left:0}70.389%{left:0;animation-timing-function:cubic-bezier(.1,0,.45,1)}' +
      '100%{left:100%}}' +
      '@keyframes kcg-portal-ext-fade{from{opacity:0}to{opacity:1}}' +
      `${O},${O} *{box-sizing:border-box}` +
      `#${LOGIN_HINT_ID},#${LOGIN_HINT_ID} *{box-sizing:border-box}` +
      `${O}{` +
      'position:fixed;inset:0;z-index:2147483647;' +
      'display:flex;align-items:center;justify-content:center;' +
      'background:var(--kx-bg,#0f172a);color:var(--kx-text,#e2e8f0);' +
      'font-family:system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;' +
      'animation:kcg-portal-ext-fade .18s ease-out}' +
      `${O} .kcg-portal-ext-sync-inner{` +
      'display:flex;flex-direction:column;align-items:center;' +
      'text-align:center;padding:32px;max-width:360px}' +
      `${O} .kcg-portal-ext-sync-mascot{` +
      'position:relative;width:72px;height:72px;border-radius:50%;overflow:hidden;flex-shrink:0;' +
      'background:var(--kx-bg2,#1e293b);' +
      'transform-origin:50% 100%;animation:kcg-portal-ext-hop .62s linear infinite}' +
      // 枠は画像の上に重ねる（アプリの foregroundDecoration と同じ）
      `${O} .kcg-portal-ext-sync-mascot::after{` +
      "content:'';position:absolute;inset:0;border-radius:50%;" +
      'box-shadow:inset 0 0 0 1.5px var(--kx-border,#334155)}' +
      `${O} .kcg-portal-ext-sync-mascot img{` +
      'display:block;width:100%;height:100%;object-fit:cover}' +
      `${O} .kcg-portal-ext-sync-bar{` +
      'position:relative;width:160px;height:4px;margin-top:18px;overflow:hidden;' +
      'background:var(--kx-track,rgba(56,189,248,.2))}' +
      `${O} .kcg-portal-ext-sync-bar::before,${O} .kcg-portal-ext-sync-bar::after{` +
      "content:'';position:absolute;top:0;bottom:0;left:0;right:100%;" +
      'background:var(--kx-accent,#38bdf8)}' +
      `${O} .kcg-portal-ext-sync-bar::before{animation:` +
      'kcg-portal-ext-bar1-head 1.8s linear infinite,kcg-portal-ext-bar1-tail 1.8s linear infinite}' +
      `${O} .kcg-portal-ext-sync-bar::after{animation:` +
      'kcg-portal-ext-bar2-head 1.8s linear infinite,kcg-portal-ext-bar2-tail 1.8s linear infinite}' +
      `${O} .kcg-portal-ext-sync-msg{` +
      'margin:14px 0 0;color:var(--kx-text,#e2e8f0);font-size:14px;font-weight:400;line-height:1.5}' +
      '@media (prefers-reduced-motion:reduce){' +
      `${O},${O} .kcg-portal-ext-sync-mascot{animation:none}` +
      `${O} .kcg-portal-ext-sync-bar::before,${O} .kcg-portal-ext-sync-bar::after{animation-duration:3.6s}}` +
      `#${LOGIN_HINT_ID}{` +
      'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
      'padding:.75rem 1rem;background:rgba(15,23,42,0.95);' +
      'border-bottom:1px solid rgba(148,163,184,0.35);' +
      'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
      'font-family:system-ui,-apple-system,sans-serif;' +
      'pointer-events:none;box-shadow:0 4px 24px rgba(0,0,0,0.12)}' +
      `#${LOGIN_HINT_ID} .kcg-portal-ext-login-hint-msg{` +
      'margin:0;text-align:center;color:#f1f5f9;font-size:.9375rem;font-weight:600;line-height:1.45}' +
      `#${LOGIN_HINT_ID} .kcg-portal-ext-login-hint-sub{` +
      'margin:.35rem 0 0;text-align:center;color:#94a3b8;font-size:.8125rem;font-weight:400;line-height:1.4}',
  );
}

function applyOverlayTheme(t: ThemeTokens): void {
  upsertRuntimeCss(
    THEME_STYLE_ID,
    `${O}{--kx-bg:${t.bg};--kx-bg2:${t.bgSecondary};--kx-border:${t.border};` +
      `--kx-text:${t.text};--kx-accent:${t.accent};--kx-track:${t.accentBg}}`,
  );
}

export function mountSyncOverlay(
  language: AppLanguage,
  message?: string,
  theme: ThemeTokens = THEMES[DEFAULT_THEME],
): void {
  applyOverlayTheme(theme);
  if (document.getElementById(OVERLAY_ID)) return;
  removeLoginHint();
  lockScroll();
  ensureUiStyles();
  // 課題取得（案内文の指定あり）のときだけ、先に届いていた段階表示を引き継ぐ
  const text =
    (message !== undefined ? earlyStepMessage : null) ??
    message ??
    messagesForLanguage(language).sync.coursesSaving;
  const root = document.createElement('div');
  root.id = OVERLAY_ID;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML =
    '<div class="kcg-portal-ext-sync-inner">' +
    '<div class="kcg-portal-ext-sync-mascot" aria-hidden="true">' +
    `<img alt="" decoding="async" src="${mascotUrl}"></div>` +
    '<div class="kcg-portal-ext-sync-bar" aria-hidden="true"></div>' +
    '<p class="kcg-portal-ext-sync-msg"></p>' +
    '</div>';
  const msg = root.querySelector('.kcg-portal-ext-sync-msg');
  if (msg) msg.textContent = text;
  (document.body ?? document.documentElement).appendChild(root);
}

/** 表示中のオーバーレイの案内文だけ差し替える（出ていなければ何もしない） */
export function updateSyncOverlayMessage(text: string): void {
  const msg = document.querySelector(`#${OVERLAY_ID} .kcg-portal-ext-sync-msg`);
  if (!msg) {
    earlyStepMessage = text;
    return;
  }
  if (msg.textContent !== text) msg.textContent = text;
}

export function removeSyncOverlay(): void {
  earlyStepMessage = null;
  document.getElementById(OVERLAY_ID)?.remove();
  unlockScroll();
}

function removeLoginHint(): void {
  document.getElementById(LOGIN_HINT_ID)?.remove();
}

export function mountLoginHint(isAssignment: boolean, language: AppLanguage): void {
  if (!isLoginRedirectPage()) return;
  ensureUiStyles();
  if (document.getElementById(LOGIN_HINT_ID)) return;
  const text = messagesForLanguage(language).sync;
  const sub = isAssignment ? text.loginAfterAssignment : text.loginAfterCourses;
  const bar = document.createElement('div');
  bar.id = LOGIN_HINT_ID;
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  bar.innerHTML =
    `<p class="kcg-portal-ext-login-hint-msg">${text.loginPlease}</p>` +
    `<p class="kcg-portal-ext-login-hint-sub">${sub}</p>`;
  (document.body ?? document.documentElement).appendChild(bar);
}
