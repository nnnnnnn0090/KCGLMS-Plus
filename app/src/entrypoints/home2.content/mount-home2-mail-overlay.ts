/**
 * Home2 Web メール: テーマ・ホスト用 CSS・オーバーレイ DOM・React のマウントまでをまとめる。
 */

import { createElement } from 'react';
import '../../styles/tailwind-overlay.css';
import {
  appendPortalOverlayShell,
  ensurePortalBackdrop,
  parseCustomThemeCollection,
  removePortalBackdrop,
  syncPortalTheme,
  type StoredCustomThemeCollection,
} from '../../domain/themes';
import storage from '../../lib/storage';
import { upsertRuntimeCss } from '../../platform/runtime-css';
import type { Home2MailRoute } from '../../domain/home2/router';
import {
  HOME2_MAIL_OVERLAY_HEADER_ONLY_CLASS,
  HOME2_MAIL_OVERLAY_SURFACE_CLASS,
  PORTAL_BOOT_COVER_RAF_FRAMES,
  PORTAL_DOM,
  SK,
} from '../../shared/constants';
import { hostTweakCssForHome2MailLayout } from './host-tweak-css';
import { DEFAULT_THEME } from '../../domain/themes/definitions';

function retainPortalBackdropAfterFrames(
  frameCount: number,
  themeName: string,
  customThemes: StoredCustomThemeCollection,
): void {
  if (frameCount <= 0) {
    ensurePortalBackdrop(themeName, customThemes);
    return;
  }
  requestAnimationFrame(() =>
    retainPortalBackdropAfterFrames(frameCount - 1, themeName, customThemes),
  );
}

export async function mountHome2MailOverlay(route: Home2MailRoute): Promise<void> {
  try {
    const themeSnap = await storage.get([SK.theme, SK.home2WebMailOverlay, SK.customThemes]);
    if (themeSnap[SK.home2WebMailOverlay] === false) {
      removePortalBackdrop();
      return;
    }
    const themeName = String(themeSnap[SK.theme] ?? '').trim() || DEFAULT_THEME;
    const customThemes = parseCustomThemeCollection(themeSnap[SK.customThemes]);

    const hostTweakCss = hostTweakCssForHome2MailLayout(route.layout);
    if (hostTweakCss) {
      upsertRuntimeCss(PORTAL_DOM.home2HostTweak, hostTweakCss);
      document.documentElement.classList.add('kcg-portal-surface');
      document.body?.classList.add('kcg-portal-surface');
    }

    const { overlay, scroller } = appendPortalOverlayShell();
    overlay.classList.add(HOME2_MAIL_OVERLAY_SURFACE_CLASS);
    if (route.layout === 'headerOnly') overlay.classList.add(HOME2_MAIL_OVERLAY_HEADER_ONLY_CLASS);

    syncPortalTheme(themeName, customThemes);

    const [{ createRoot }, { PortalApp }] = await Promise.all([
      import('react-dom/client'),
      import('../../ui/app'),
    ]);
    const root = createRoot(scroller);
    root.render(
      createElement(PortalApp, {
        surface: 'home2-mail',
        route,
        syncToastMsg: '',
        overlayRoot: scroller,
      }),
    );

    retainPortalBackdropAfterFrames(PORTAL_BOOT_COVER_RAF_FRAMES.default, themeName, customThemes);
  } catch {
    removePortalBackdrop();
  }
}
