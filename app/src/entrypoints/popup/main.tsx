/**
 * ツールバーのアイコンを押したときのメニュー。
 * 拡張機能のオン／オフ、バージョンと更新の有無、よく使うページへの入口、関連リンクをまとめる。
 * 配色と言語はポータル側の設定（テーマ・言語）に合わせる。
 */

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, House } from 'lucide-react';
import { SK } from '../../contract/storage-keys';
import {
  EXTENSION_AUTHOR_PROFILE_URL,
  EXTENSION_ENABLED_URL,
  EXTENSION_FEEDBACK_FORM_URL,
  EXTENSION_PROMO_PAGE_URL,
  EXTENSION_PROMO_ORIGIN,
  KING_LMS_ORIGIN,
  PORTAL_COMMUNITY_DISCORD_INVITE_URL,
  PORTAL_ORIGIN,
} from '../../contract/origins';
import { chromeStorageClient } from '../../platform/storage/chrome-storage-client';
import { storageClient } from '../../platform/storage/client';
import { parseCustomThemes, parseThemeId } from '../../platform/storage/parsers';
import { resolveThemeTokens } from '../../domain/themes/custom-themes';
import type { ThemeTokens } from '../../domain/themes/theme-tokens';
import { messagesForLanguage, normalizeLanguage, type AppLanguage } from '../../i18n/messages';
import { readExtensionVersion } from '../../lib/extension-version';
import { normalizeUiFont, UI_FONT_STACK, uiFontStylesheetHref } from '../../domain/ui-font';
import { checkExtensionUpdateAvailable } from '../../lib/fetch-latest-extension-version';
import { buildKingLmsSamlLoginUrl } from '../../shared/king-lms-url';
import './style.css';

const PORTAL_HOME_URL = `${PORTAL_ORIGIN}/portal/`;
/** ログインしていなくても学校のサインインを経てコース一覧に着く */
const KING_LMS_HOME_URL = buildKingLmsSamlLoginUrl(`${KING_LMS_ORIGIN}/ultra/course`);
const AUTHOR_NAME = EXTENSION_AUTHOR_PROFILE_URL.split('/').pop() ?? '';

type UpdateState =
  { status: 'checking' } | { status: 'latest' } | { status: 'update'; latest: string };

/** ポータルの `#portal-overlay` と同じ名前の変数で、同じテーマを当てる */
function applyTheme(t: ThemeTokens): void {
  const root = document.documentElement.style;
  const vars: Record<string, string> = {
    '--p-bg': t.bg,
    '--p-bg2': t.bgSecondary,
    '--p-bg3': t.bgTertiary,
    '--p-bg-hover': t.bgHover,
    '--p-border': t.border,
    '--p-border-light': t.borderLight,
    '--p-border-hover': t.borderHover,
    '--p-text': t.text,
    '--p-text-muted': t.textMuted,
    '--p-text-dim': t.textDim,
    '--p-text-dimmer': t.textDimmer,
    '--p-text-bright': t.textBright,
    '--p-accent': t.accent,
    '--p-accent-light': t.accentLight,
    '--p-accent-bg': t.accentBg,
    '--p-accent-border': t.accentBorder,
    '--p-on-accent': t.onAccent,
    '--p-danger': t.danger,
    '--p-shadow': t.shadow,
    '--p-shadow-strong': t.shadowStrong,
  };
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
}

/** ポータルで選んでいるフォントを当てる（Google Fonts のものは読み込む） */
function applyFont(raw: unknown): void {
  const font = normalizeUiFont(raw);
  document.documentElement.style.setProperty('--p-font', UI_FONT_STACK[font]);
  const href = uiFontStylesheetHref(font);
  if (!href) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/** サーバー側でメンテナンス停止しているか（取れなければ止まっていない扱い） */
async function fetchMaintenance(): Promise<boolean> {
  try {
    const r = await fetch(EXTENSION_ENABLED_URL, { cache: 'no-store' });
    if (!r.ok) return false;
    const body = (await r.json()) as { enabled?: unknown };
    return body.enabled === false;
  } catch {
    return false;
  }
}

function openTab(url: string): void {
  void browser.tabs.create({ url });
  window.close();
}

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

/** 設定パネルの「このアプリについて」と同じ、全幅の控えめなボタン */
function LinkButton({ href, label }: { href: string; label: string }) {
  return (
    <button type="button" className="p-settings-tour-replay-btn" onClick={() => openTab(href)}>
      {label}
    </button>
  );
}

function Popup() {
  const version = readExtensionVersion();
  const [language, setLanguage] = useState<AppLanguage>('ja');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const [update, setUpdate] = useState<UpdateState>({ status: 'checking' });
  const t = messagesForLanguage(language).popup;

  useEffect(() => {
    void chromeStorageClient
      .get([SK.theme, SK.customThemes, SK.language, SK.font, SK.extensionUserDisabled])
      .then((data) => {
        applyTheme(
          resolveThemeTokens(
            parseThemeId(data[SK.theme]),
            parseCustomThemes(data[SK.customThemes]),
          ),
        );
        applyFont(data[SK.font]);
        const lang = normalizeLanguage(data[SK.language]);
        setLanguage(lang);
        document.documentElement.lang = lang;
        setEnabled(data[SK.extensionUserDisabled] !== true);
      });
    void fetchMaintenance().then(setMaintenance);
    void checkExtensionUpdateAvailable().then((r) =>
      setUpdate(
        r.updateAvailable && r.latest
          ? { status: 'update', latest: r.latest }
          : { status: 'latest' },
      ),
    );
  }, []);

  const toggle = () => {
    if (enabled === null) return;
    const next = !enabled;
    setEnabled(next);
    // 各ページはこの値の変化を受けて、写しを直して読み込み直す
    void storageClient.set({ [SK.extensionUserDisabled]: !next });
  };

  const common = messagesForLanguage(language);

  return (
    <main className="pp" data-ready={enabled !== null}>
      <header className="p-header">
        <span className="p-brand">
          <img src="/icon/128.png" alt="" width="28" height="28" />
          KCGLMS+
        </span>
        {update.status === 'update' ? (
          <button
            type="button"
            className="pp-update"
            onClick={() => openTab(EXTENSION_PROMO_PAGE_URL)}
          >
            {t.updateAvailable(update.latest)}
          </button>
        ) : null}
      </header>

      <div className="pp-body">
        <section className="p-settings-section">
          <div className="p-settings-section-title">{t.sectionExtension}</div>
          <label className={`p-settings-switch-row${enabled === null ? ' is-disabled' : ''}`}>
            <span>
              <span className="pp-switch-label">{t.useLabel}</span>
              <span className="p-settings-hint">
                {enabled === false ? t.statusOff : t.statusOn}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={enabled !== false}
              disabled={enabled === null}
              onChange={toggle}
            />
            <span className="p-settings-switch-track" aria-hidden="true" />
          </label>
          <p className="p-settings-hint p-settings-hint--tight">{t.reloadNote}</p>
          {maintenance ? (
            <p className="pp-notice" role="status">
              {t.maintenance}
            </p>
          ) : null}
        </section>

        <section className="p-settings-section">
          <div className="p-settings-section-title">{t.sectionOpen}</div>
          <div className="pp-open">
            <button type="button" className="p-btn" onClick={() => openTab(PORTAL_HOME_URL)}>
              <House size={15} aria-hidden="true" />
              {t.openPortal}
            </button>
            <button type="button" className="p-btn" onClick={() => openTab(KING_LMS_HOME_URL)}>
              <BookOpen size={15} aria-hidden="true" />
              {t.openKingLms}
            </button>
          </div>
        </section>

        <section className="p-settings-section">
          <div className="p-settings-section-title">{t.links}</div>
          <div className="p-settings-action-stack">
            <LinkButton href={EXTENSION_PROMO_PAGE_URL} label={t.website} />
            {EXTENSION_FEEDBACK_FORM_URL ? (
              <LinkButton href={EXTENSION_FEEDBACK_FORM_URL} label={t.feedback} />
            ) : null}
            {PORTAL_COMMUNITY_DISCORD_INVITE_URL ? (
              <LinkButton href={PORTAL_COMMUNITY_DISCORD_INVITE_URL} label={t.discord} />
            ) : null}
            <LinkButton href={`${EXTENSION_PROMO_ORIGIN}/privacy-policy`} label={t.privacy} />
          </div>
        </section>

        <footer className="p-settings-footer">
          <p className="p-settings-credit">
            {t.developer}{' '}
            <button
              type="button"
              className="p-settings-credit-link"
              onClick={() => openTab(EXTENSION_AUTHOR_PROFILE_URL)}
            >
              <XLogo />
              {AUTHOR_NAME}
            </button>
          </p>
          <p className="p-settings-version">
            {common.settings.version(version)}
            {update.status === 'latest' ? ` · ${t.upToDate}` : ''}
          </p>
        </footer>
      </div>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Popup />
    </StrictMode>,
  );
}
