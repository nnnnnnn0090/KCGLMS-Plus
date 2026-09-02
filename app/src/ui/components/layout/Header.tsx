/**
 * オーバーレイ上部のヘッダー（学ポータル / Home2 Web メール）。
 * ホスト DOM からナビ・プロフィール・ログアウトを取り込み、設定ポップオーバーを差し込む。
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Settings } from '../../../context/settings';
import {
  HOME2_MAIL_DEFAULT_URL,
  HOME2_ORIGIN,
  HOME2_TOP_PAGE_URL,
  PORTAL_DOM,
} from '../../../shared/constants';
import { findHostLogoffAnchor, requestHostPortalLogoff } from '../../../services/logoff';
import { resolvePortalNavLabel } from '../../../lib/portal-nav-labels';
import { useI18n } from '../../../i18n';
import type { AppLanguage, I18nMessages } from '../../../i18n/messages';
import { messagesForLanguage } from '../../../i18n/messages';
import { useExtensionUpdateAvailable } from '../../../hooks/useExtensionUpdateAvailable';
import { CommunityActivityDrawer } from './CommunityActivityDrawer';
import {
  acceptCommunityDisclaimer,
  fetchCommunityAccess,
  getCommunityDisclaimerAccepted,
} from '../../../services/community-access';
import { readPortalStudentKeyProof } from '../../../services/portal-student-key';
import {
  clearCommunityUrlParams,
  hasCommunityUrlParams,
} from '../../../services/community-url-params';

// ─── ナビゲーション型 ─────────────────────────────────────────────────────

interface NavLink {
  type: 'link';
  label: string;
  href: string;
  target?: string;
  title?: string;
}

interface NavGroup {
  type: 'group';
  label: string;
  items: NavLink[];
}

type NavItem = NavLink | NavGroup;

// ─── DOM 解析 ─────────────────────────────────────────────────────────────

function resolveHref(href: string): string {
  try {
    return new URL(href, location.origin).href;
  } catch {
    return href;
  }
}

function parseNavItems(ul: HTMLUListElement): NavItem[] {
  const out: NavItem[] = [];
  for (const li of ul.children) {
    if (!(li instanceof HTMLElement)) continue;
    if (li.classList.contains('logoff')) continue;

    if (li.classList.contains('dropdown')) {
      const toggle = li.querySelector<HTMLElement>(':scope > a.dropdown-toggle');
      const menu = li.querySelector<HTMLElement>(':scope > ul.dropdown-menu');
      if (!toggle || !menu) continue;

      const clone = toggle.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.caret').forEach((c) => c.remove());
      const groupLabel = clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';

      const subs: NavLink[] = [];
      for (const a of menu.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        const h = a.getAttribute('href');
        if (!h || h === '#' || h.startsWith('javascript:')) continue;
        subs.push({
          type: 'link',
          label: a.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          href: h,
          target: a.getAttribute('target') ?? '',
          title: a.getAttribute('title') ?? '',
        });
      }
      if (subs.length === 0) continue;
      out.push(subs.length === 1 ? subs[0] : { type: 'group', label: groupLabel, items: subs });
    } else {
      const a = li.querySelector<HTMLAnchorElement>(':scope > a[href]');
      if (!a) continue;
      const h = a.getAttribute('href');
      if (!h || h === '#' || h.startsWith('javascript:')) continue;
      out.push({
        type: 'link',
        label: a.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        href: h,
        target: a.getAttribute('target') ?? '',
        title: a.getAttribute('title') ?? '',
      });
    }
  }
  return out;
}

function localizePortalNavItems(
  items: NavItem[],
  t: I18nMessages,
  language: AppLanguage,
): NavItem[] {
  return items.map((item) => {
    if (item.type === 'link') {
      return { ...item, label: resolvePortalNavLabel(item.href, item.label, t, language) };
    }
    return {
      ...item,
      label: resolvePortalNavLabel(item.items[0]?.href ?? '', item.label, t, language),
      items: item.items.map((sub) => ({
        ...sub,
        label: resolvePortalNavLabel(sub.href, sub.label, t, language),
      })),
    };
  });
}

/** Home2 `#NavigationMenu` → `NavItem[]` */
function parseHome2NavItems(menuRoot: HTMLElement): NavItem[] {
  const ul = menuRoot.querySelector<HTMLUListElement>('ul.level1');
  if (!ul) return [];
  const out: NavItem[] = [];
  for (const li of ul.children) {
    if (!(li instanceof HTMLElement)) continue;

    if (li.classList.contains('has-popup')) {
      const toggle = li.querySelector<HTMLAnchorElement>(':scope > a');
      const subUl = li.querySelector<HTMLUListElement>(':scope > ul.level2');
      if (!toggle || !subUl) continue;
      const groupLabel = toggle.textContent?.replace(/\s+/g, ' ').trim() ?? '';

      const subs: NavLink[] = [];
      for (const a of subUl.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        const h = a.getAttribute('href');
        if (!h || h === '#' || h.toLowerCase().startsWith('javascript:')) continue;
        subs.push({
          type: 'link',
          label: a.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          href: h,
          target: a.getAttribute('target') ?? '',
          title: a.getAttribute('title') ?? '',
        });
      }
      if (subs.length === 0) continue;
      out.push(subs.length === 1 ? subs[0] : { type: 'group', label: groupLabel, items: subs });
    } else {
      const a = li.querySelector<HTMLAnchorElement>(':scope > a[href]');
      if (!a) continue;
      const h = a.getAttribute('href');
      if (!h || h === '#' || h.toLowerCase().startsWith('javascript:')) continue;
      out.push({
        type: 'link',
        label: a.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        href: h,
        target: a.getAttribute('target') ?? '',
        title: a.getAttribute('title') ?? '',
      });
    }
  }
  return out;
}

const HIDDEN_HOME2_NAV_LABELS = new Set(['実験中', 'KCG WebMail']);
const HOST_HOME_LABEL = 'ホーム';
const HOST_PORTAL_LABEL = 'キャンパスプランポータル';

function localizeHome2NavItems(items: NavItem[], t: I18nMessages): NavItem[] {
  const labels = { home: t.common.home, portal: t.header.portal };
  return finalizeHome2NavItems(items, labels);
}

/** Home2 メニュー項目のリンク・ラベル調整 */
interface Home2NavLabels {
  home: string;
  portal: string;
}

function mapHome2Link(link: NavLink, labels: Home2NavLabels): NavLink | null {
  const t = link.label.trim();
  if (HIDDEN_HOME2_NAV_LABELS.has(t)) return null;
  const href = t === HOST_HOME_LABEL ? HOME2_TOP_PAGE_URL : link.href;
  const label =
    t === HOST_PORTAL_LABEL ? labels.portal : t === HOST_HOME_LABEL ? labels.home : link.label;
  return { ...link, href, label };
}

function finalizeHome2NavItems(items: NavItem[], labels: Home2NavLabels): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.type === 'link') {
      const mapped = mapHome2Link(item, labels);
      if (mapped) out.push(mapped);
      continue;
    }
    if (HIDDEN_HOME2_NAV_LABELS.has(item.label.trim())) continue;
    const groupLabel = item.label.trim() === HOST_PORTAL_LABEL ? labels.portal : item.label;
    const subs = item.items
      .map((sub) => mapHome2Link(sub, labels))
      .filter((s): s is NavLink => s != null);
    if (subs.length === 0) continue;

    const homeSplit =
      item.label.trim() === HOST_HOME_LABEL &&
      subs.length >= 2 &&
      subs[0]!.label.trim() === labels.home;
    if (homeSplit) {
      out.push({
        type: 'link',
        label: labels.home,
        href: HOME2_TOP_PAGE_URL,
        target: '',
        title: '',
      });
      continue;
    }

    out.push(subs.length === 1 ? subs[0]! : { ...item, label: groupLabel, items: subs });
  }
  return out;
}

// ─── カスタムフック ───────────────────────────────────────────────────────

function usePortalProfile(fallbackTitle: string) {
  const [profile, setProfile] = useState<{ name: string; href: string; title: string } | null>(
    null,
  );

  // マウント時に一度だけ DOM から取得。表示/非表示は呼び出し側で CSS クラスで制御する。
  useEffect(() => {
    const src = [...document.querySelectorAll<HTMLAnchorElement>('span.profile a[href]')].find(
      (a) => !a.closest('#portal-overlay'),
    );
    const name = src?.textContent?.trim() ?? '';
    if (!name) {
      setProfile(null);
      return;
    }
    let href = '/portal/Profile';
    try {
      href = new URL(src!.getAttribute('href') ?? '/portal/Profile', location.origin).href;
    } catch (error) {
      void error;
    }
    setProfile({ name, href, title: src!.getAttribute('title') ?? fallbackTitle });
  }, [fallbackTitle]);

  return profile;
}

// ─── コンポーネント ────────────────────────────────────────────────────────

interface HeaderProps {
  settings: Settings;
  settingsReady: boolean;
  settingsOpen: boolean;
  onSettingsToggle: () => void;
  settingsPopover: ReactNode;
  navSource?: 'portal' | 'home2-mail';
}

export function Header({
  settings,
  settingsReady,
  settingsOpen,
  onSettingsToggle,
  settingsPopover,
  navSource = 'portal',
}: HeaderProps) {
  const { t, language } = useI18n();
  const { updateAvailable } = useExtensionUpdateAvailable();
  const [rawNavItems, setRawNavItems] = useState<NavItem[]>([]);
  const [showLogout, setShowLogout] = useState(navSource === 'portal');
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityConsentOpen, setActivityConsentOpen] = useState(false);
  const [communityEnabled, setCommunityEnabled] = useState(false);
  const [communityApiOrigin, setCommunityApiOrigin] = useState('');
  const [portalStudentKeyProof, setPortalStudentKeyProof] = useState<string | null>(null);
  const profile = usePortalProfile(t.header.profileTitle);

  const navItems = useMemo(() => {
    if (navSource === 'portal') return localizePortalNavItems(rawNavItems, t, language);
    return localizeHome2NavItems(rawNavItems, t);
  }, [rawNavItems, navSource, t, language]);

  useEffect(() => {
    if (navSource === 'portal') {
      const ul = [...document.querySelectorAll<HTMLUListElement>('ul.nav.navbar-nav')].find(
        (el) => !el.closest(`#${PORTAL_DOM.overlayRoot}`),
      );
      setRawNavItems(ul ? parseNavItems(ul) : []);
      setShowLogout(true);
      return;
    }

    const menu = document.getElementById('NavigationMenu');
    if (menu && !menu.closest(`#${PORTAL_DOM.overlayRoot}`)) {
      setRawNavItems(parseHome2NavItems(menu));
    } else {
      setRawNavItems([]);
    }

    const nativePortalLogout = findHostLogoffAnchor(PORTAL_DOM.overlayRoot) != null;

    const webMailLo = document.getElementById('MainContent_butLogout');
    const hasWebMailLogout =
      webMailLo instanceof HTMLInputElement && !webMailLo.closest(`#${PORTAL_DOM.overlayRoot}`);

    setShowLogout(nativePortalLogout || hasWebMailLogout);
  }, [navSource]);

  useEffect(() => {
    if (navSource !== 'portal') {
      setPortalStudentKeyProof(null);
      return;
    }
    let cancelled = false;
    void readPortalStudentKeyProof()
      .then((proof) => {
        if (!cancelled) setPortalStudentKeyProof(proof);
      })
      .catch(() => {
        if (!cancelled) setPortalStudentKeyProof(null);
      });
    return () => {
      cancelled = true;
    };
  }, [navSource]);

  useEffect(() => {
    if (navSource !== 'portal') {
      setCommunityEnabled(false);
      setCommunityApiOrigin('');
      return;
    }
    const controller = new AbortController();
    void fetchCommunityAccess(controller.signal)
      .then((result) => {
        setCommunityApiOrigin(result.apiOrigin);
        setCommunityEnabled(result.enabled);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCommunityEnabled(false);
          setCommunityApiOrigin('');
        }
      });
    return () => controller.abort();
  }, [navSource]);

  useEffect(() => {
    if (
      navSource !== 'portal' ||
      !communityEnabled ||
      !communityApiOrigin ||
      !portalStudentKeyProof
    )
      return;
    if (!hasCommunityUrlParams()) return;
    let cancelled = false;
    void (async () => {
      const accepted = await getCommunityDisclaimerAccepted().catch(() => false);
      if (cancelled) return;
      if (accepted) setActivityOpen(true);
      else setActivityConsentOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navSource, communityEnabled, communityApiOrigin, portalStudentKeyProof]);

  function closeCommunityShell() {
    setActivityOpen(false);
    setActivityConsentOpen(false);
    clearCommunityUrlParams();
  }

  /**
   * `href` が実URLのときだけ location 遷移する。`#` / `javascript:` / PostBack 等は click に任せる。
   */
  function tryAssignLocationFromLogoutAnchor(a: HTMLAnchorElement): boolean {
    const raw = a.getAttribute('href')?.trim() ?? '';
    if (!raw || raw === '#' || raw.toLowerCase().startsWith('javascript:')) return false;
    try {
      const u = new URL(raw, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    } catch {
      return false;
    }
    window.location.href = a.href;
    return true;
  }

  function handleLogout() {
    closeCommunityShell();
    if (navSource === 'home2-mail') {
      const webLo = document.getElementById('MainContent_butLogout');
      if (webLo instanceof HTMLInputElement && !webLo.closest(`#${PORTAL_DOM.overlayRoot}`)) {
        webLo.click();
        return;
      }
    }
    const logoutLink = findHostLogoffAnchor(PORTAL_DOM.overlayRoot);
    if (navSource === 'home2-mail' && !logoutLink) return;
    if (logoutLink) {
      if (tryAssignLocationFromLogoutAnchor(logoutLink)) return;
      // `javascript:__doPostBack` 等は隔離ワールドの click が Chrome CSP で拒否されるため MAIN へ委譲
      requestHostPortalLogoff();
      return;
    }
    window.location.href = '/portal/Login';
  }

  const navLabel = navSource === 'home2-mail' ? t.header.home2Menu : t.header.portalMenu;

  async function openCommunityActivity() {
    if (!communityApiOrigin || !portalStudentKeyProof) return;
    const accepted = await getCommunityDisclaimerAccepted().catch(() => false);
    if (accepted) setActivityOpen(true);
    else setActivityConsentOpen(true);
  }

  async function onAcceptCommunityDisclaimer() {
    try {
      await acceptCommunityDisclaimer();
    } catch {
      // 同意済み状態を保存できない場合も、今回の明示的な同意では利用を続けられるようにする。
    }
    setActivityConsentOpen(false);
    setActivityOpen(true);
  }

  return (
    <>
      <header className="p-header">
        <div className="p-header-inner">
          {navSource === 'home2-mail' ? (
            <a className="p-brand" href={HOME2_MAIL_DEFAULT_URL}>
              <img src={`${HOME2_ORIGIN}/ic.bmp`} width={28} height={28} alt="" />
              <span>{t.header.webMail}</span>
            </a>
          ) : (
            <a className="p-brand" href="/portal/">
              <img src="/portal/favicon.ico" width={28} height={28} alt="" />
              <span>{t.header.portal}</span>
            </a>
          )}

          {navItems.length > 0 && (
            <nav className="p-site-nav" id="p-site-nav" aria-label={navLabel}>
              {navItems.map((item, i) =>
                item.type === 'link' ? (
                  <NavLinkItem key={i} item={item} />
                ) : (
                  <NavGroupItem key={i} item={item} />
                ),
              )}
            </nav>
          )}

          {navSource === 'portal' && communityEnabled && portalStudentKeyProof ? (
            <button
              type="button"
              className="p-community-activity-entry inline-flex items-center gap-2 whitespace-nowrap"
              aria-label={t.header.communityActivity}
              aria-expanded={activityOpen}
              aria-controls="p-community-activity-drawer"
              onClick={() => void openCommunityActivity()}
            >
              <img
                src={browser.runtime.getURL('/community/activity-icon.png')}
                width={22}
                height={22}
                alt=""
              />
              <span>{t.header.communityActivity}</span>
            </button>
          ) : null}

          <div className="p-header-actions">
            <div className="p-settings-wrap" id="p-settings-wrap">
              <button
                type="button"
                className={`p-settings-open${updateAvailable ? ' has-update' : ''}`}
                id="p-open-settings"
                aria-expanded={settingsOpen}
                aria-haspopup="dialog"
                aria-controls="p-settings-dialog"
                onClick={(e) => {
                  e.stopPropagation();
                  onSettingsToggle();
                }}
                title={updateAvailable ? t.settings.updateAvailableTitle : undefined}
              >
                {updateAvailable && <span className="p-settings-update-pulse" aria-hidden="true" />}
                {t.header.settings}
              </button>
              {settingsPopover}
            </div>

            {settingsReady && profile && (
              <span
                className={`p-profile-wrap${settings.hideProfileName ? ' is-hidden' : ''}`}
                id="p-profile-wrap"
                aria-hidden={settings.hideProfileName}
              >
                <a className="p-profile-link" href={profile.href} title={profile.title}>
                  {profile.name}
                </a>
              </span>
            )}

            {showLogout ? (
              <button type="button" className="p-logout" onClick={handleLogout}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                {t.header.logout}
              </button>
            ) : null}
          </div>
        </div>
      </header>
      {activityOpen
        ? createPortal(
            <CommunityActivityDrawer
              language={language}
              apiOrigin={communityApiOrigin}
              onClose={closeCommunityShell}
            />,
            document.getElementById(PORTAL_DOM.overlayRoot) ?? document.body,
          )
        : null}
      {activityConsentOpen
        ? createPortal(
            <CommunityConsentDialog
              language={language}
              onCancel={closeCommunityShell}
              onAccept={() => void onAcceptCommunityDisclaimer()}
            />,
            document.getElementById(PORTAL_DOM.overlayRoot) ?? document.body,
          )
        : null}
    </>
  );
}

function CommunityConsentDialog({
  language,
  onCancel,
  onAccept,
}: {
  language: AppLanguage;
  onCancel: () => void;
  onAccept: () => void;
}) {
  const consent = messagesForLanguage(language).community.consent;
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="p-community-consent-layer" role="presentation">
      <section
        className="p-community-consent"
        role="dialog"
        aria-modal="true"
        aria-labelledby="p-community-consent-title"
      >
        <div className="p-community-consent-mark" aria-hidden="true">
          !
        </div>
        <small>{consent.preamble}</small>
        <h2 id="p-community-consent-title">{consent.title}</h2>
        <p>{consent.body}</p>
        <ul>
          {consent.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <label className="p-community-consent-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
          />
          <span>{consent.checkbox}</span>
        </label>
        <footer>
          <button type="button" onClick={onCancel}>
            {consent.cancel}
          </button>
          <button className="is-primary" type="button" disabled={!confirmed} onClick={onAccept}>
            {consent.accept}
          </button>
        </footer>
      </section>
    </div>
  );
}

// ─── ナビアイテムコンポーネント ───────────────────────────────────────────

function NavLinkItem({ item }: { item: NavLink }) {
  const href = resolveHref(item.href);
  const isBlank = item.target && item.target !== '_self';
  return (
    <a
      className="p-nav-btn"
      href={href}
      target={isBlank ? item.target : undefined}
      rel={isBlank ? 'noopener noreferrer' : undefined}
      title={item.title || undefined}
    >
      {item.label}
    </a>
  );
}

function NavGroupItem({ item }: { item: NavGroup }) {
  return (
    <details className="p-nav-dd">
      <summary className="p-nav-btn p-nav-dd-sum">{item.label}</summary>
      <div className="p-nav-dd-panel">
        {item.items.map((sub, i) => (
          <NavLinkItem key={i} item={sub} />
        ))}
      </div>
    </details>
  );
}
