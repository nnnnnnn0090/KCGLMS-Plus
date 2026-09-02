/**
 * ポータルオーバーレイのアプリケーションルート。
 * ヘッダー・ページ末尾クローム（フッター／カレンダーアンカー／FAB）・ページアウトレット・トースト・案内を統合する。
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSettings } from '../../context/settings';
import { usePortalDom } from '../../context/portalDom';
import { useI18n } from '../../i18n';
import { useToast, Toast, copyToClipboard } from '../components/ui/Toast';
import { Header } from '../components/layout/Header';
import { PortalPageEndChrome } from '../components/layout/PortalPageEndChrome';
import { SettingsPanel, type SettingsPanelHandle } from '../components/layout/settings';
import { EXTENSION_PROMO_PAGE_URL, PAGE, PORTAL_ORIGIN, SK } from '../../shared/constants';
import storage from '../../lib/storage';
import { consumeExtensionUpdateToastMessage } from '../../services/update-notice';
import { extensionUpdateToastDurationMs, syncToastDurationMs } from '../../services/toast';
import type { PortalRoute } from '../../domain/portal/router';
import type { PortalAppRoute, PortalSurface } from './types';
import { isHome2MailRoute } from './types';
import { PortalPageOutlet } from './routes';
import { AppProviders } from './providers';
import { GuidedTour } from '../components/ui/GuidedTour';

// ─── 型 ───────────────────────────────────────────────────────────────────

export interface PortalAppProps {
  surface: PortalSurface;
  route: PortalAppRoute;
  /** King LMS 同期完了トースト（ポータルのみ） */
  syncToastMsg: string;
  /** コンテンツスクリプトが作成した #portal-overlay 要素（スクロール・イベント委譲の基点） */
  overlayRoot: HTMLElement;
}

// ─── エントリポイント（Provider ラッパー） ─────────────────────────────────

/** `portal.content` / `home2.content` のエントリからマウントされるルートコンポーネントです。 */
export function PortalApp(props: PortalAppProps) {
  return (
    <AppProviders overlayRoot={props.overlayRoot}>
      <PortalAppShell {...props} />
    </AppProviders>
  );
}

// ─── アプリシェル ─────────────────────────────────────────────────────────

function PortalAppShell({ surface, route, syncToastMsg }: PortalAppProps) {
  const { settings, settingsReady, updateSetting, updateTheme } = useSettings();
  const { language, t } = useI18n();
  const { settingsPopRef, overlayRoot } = usePortalDom();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guidedTourReplayToken, setGuidedTourReplayToken] = useState(0);
  const settingsPanelRef = useRef<SettingsPanelHandle | null>(null);
  const { toast, show: showToast, onAnimationEnd } = useToast();

  const portalRoute = surface === 'portal' ? (route as PortalRoute) : null;

  const showFullChrome =
    surface === 'portal' ||
    (isHome2MailRoute(route) &&
      (route.layout === 'full' ||
        route.layout === 'mailHead' ||
        route.layout === 'readMail' ||
        route.layout === 'sendMail'));

  const pageEndFabScrollTopScope =
    surface === 'home2-mail' && isHome2MailRoute(route) && route.layout === 'headerOnly'
      ? ('window' as const)
      : ('overlay' as const);

  const calendarInteractionEpoch = useMemo(() => {
    if (isHome2MailRoute(route)) return `h2:${route.layout}`;
    if (surface === 'portal' && portalRoute) {
      const base =
        portalRoute.detailId != null
          ? `p:${portalRoute.page}:${portalRoute.detailId}`
          : `p:${portalRoute.page}`;
      if (portalRoute.page === PAGE.HOME) {
        return `${base}:hideAsg${settings.hideAssignmentCalendar ? '1' : '0'}`;
      }
      return base;
    }
    return String(surface);
  }, [surface, route, portalRoute, settings.hideAssignmentCalendar]);

  const handleReplayGuidedTour = useCallback(() => {
    if (!portalRoute) return;
    settingsPanelRef.current?.requestClose();
    overlayRoot.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    void storage.set({ [SK.portalGuidedTourDone]: false }).then(() => {
      if (portalRoute.page !== PAGE.HOME) {
        window.location.assign(`${PORTAL_ORIGIN}/portal/`);
        return;
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setGuidedTourReplayToken((n) => n + 1);
        });
      });
    });
  }, [portalRoute, overlayRoot]);

  // King LMS 同期完了トースト（親から渡された初回メッセージのみ）
  useEffect(() => {
    if (!syncToastMsg) return;
    showToast(syncToastMsg, {
      placement: 'top',
      durationMs: syncToastDurationMs(syncToastMsg),
    });
  }, [syncToastMsg, showToast]);

  // 拡張機能の manifest バージョンが上がったときのトースト（同一タブ・同一メッセージは一度だけ）
  useEffect(() => {
    if (!settingsReady) return;
    void consumeExtensionUpdateToastMessage(language).then((msg) => {
      if (!msg) return;
      const mark = `kcg-portal-ext-up-toast:${msg}`;
      try {
        if (sessionStorage.getItem(mark)) return;
        sessionStorage.setItem(mark, '1');
      } catch {
        /* ストレージ不可時はそのまま表示 */
      }
      showToast(msg, { placement: 'top', durationMs: extensionUpdateToastDurationMs });
    });
  }, [settingsReady, showToast, language]);

  // 拡張機能紹介 URL のコピー
  const handleShareClick = useCallback(async () => {
    const ok = await copyToClipboard(EXTENSION_PROMO_PAGE_URL);
    showToast(ok ? t.sync.urlCopied : t.sync.copyFailed);
  }, [showToast, t]);

  // 設定パネルのトグル（開いている場合は閉じるアニメを先に実行）
  const toggleSettings = useCallback(() => {
    if (settingsOpen) {
      settingsPanelRef.current?.requestClose();
      return;
    }
    setSettingsOpen(true);
  }, [settingsOpen]);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const settingsVariant = surface === 'home2-mail' ? 'home2' : 'portal';

  return (
    <>
      <Header
        navSource={surface === 'home2-mail' ? 'home2-mail' : 'portal'}
        settings={settings}
        settingsReady={settingsReady}
        settingsOpen={settingsOpen}
        onSettingsToggle={toggleSettings}
        settingsPopover={
          <SettingsPanel
            ref={settingsPanelRef}
            popoverSurfaceRef={settingsPopRef}
            isOpen={settingsOpen}
            settings={settings}
            variant={settingsVariant}
            onClose={closeSettings}
            onThemeChange={updateTheme}
            onSettingChange={updateSetting}
            onReplayGuidedTour={handleReplayGuidedTour}
          />
        }
      />

      <PortalPageOutlet route={route} settings={settings} />

      {showFullChrome ? (
        <PortalPageEndChrome
          onShareClick={handleShareClick}
          scrollTopScope={pageEndFabScrollTopScope}
          calendarInteractionEpoch={calendarInteractionEpoch}
        />
      ) : null}

      {surface === 'portal' && portalRoute ? (
        <GuidedTour
          route={portalRoute}
          settingsReady={settingsReady}
          hideAssignmentCalendar={settings.hideAssignmentCalendar}
          guidedTourReplayToken={guidedTourReplayToken}
        />
      ) : null}
      <Toast toast={toast} onAnimationEnd={onAnimationEnd} />
    </>
  );
}
