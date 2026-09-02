/**
 * 設定パネルコンポーネント。
 * ヘッダーの「設定」ボタンの直下に表示されるポップオーバー形式のダイアログ。
 * カラーテーマ、（ポータル時）ホームの装飾・表示設定、Web メール、フィードバック（.env で設定したときのみフォーム・Discord）、（Home2 時）チェンジログ、
 * バージョン表記などをまとめるパネル。表示設定内の操作は案内再表示 → チェンジログ → King LMS 再取得の順。
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import type { Settings } from '../../../../context/settings';
import type { CustomTheme } from '../../../../domain/themes';
import { readExtensionVersion } from '../../../../lib/extension-version';
import { CHANGELOG_JSON_URL, PORTAL_DOM } from '../../../../shared/constants';
import { useExtensionUpdateAvailable } from '../../../../hooks/useExtensionUpdateAvailable';
import { useI18n } from '../../../../i18n';
import { parseChangelogJson, type ParsedChangelogRelease } from './settings-changelog';
import { SettingsChangelogModal } from './SettingsChangelogModal';
import { SettingsLicensesModal } from './SettingsLicensesModal';
import {
  SettingsFeedbackSection,
  SettingsCplanSection,
  SettingsHome2ChangelogSection,
  SettingsLanguageSection,
  SettingsPortalOnlySections,
  SettingsThemeSection,
  SettingsWebMailSection,
} from './SettingsPanelSections';
import { SettingsFontSection } from './SettingsFontSection';
import { ThemeStudio } from './ThemeStudio';
import { clearSettingsPopoverLayout, layoutSettingsPopover } from './settings-popover-layout';

const extensionVersion = readExtensionVersion();
type SettingsTab = 'appearance' | 'connections' | 'support';

// ─── 型 ───────────────────────────────────────────────────────────────────

interface SettingsPanelProps {
  /** ポップオーバー外枠 DOM（Escape 連携などで他フックから参照する） */
  popoverSurfaceRef?: Ref<HTMLDivElement | null>;
  isOpen: boolean;
  settings: Settings;
  onClose: () => void;
  onThemeChange: (name: string) => void;
  onSettingChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void | Promise<void>;
  /** 初回案内チュートリアルを先頭から再表示する */
  onReplayGuidedTour: () => void;
  /** Home2 Mail ではカラーテーマとバージョンのみ */
  variant?: 'portal' | 'home2';
}

export interface SettingsPanelHandle {
  /** 閉じるアニメーションを開始する（ヘッダーの設定ボタンから呼ばれる） */
  requestClose: () => void;
}

// ─── コンポーネント ────────────────────────────────────────────────────────

export const SettingsPanel = forwardRef<SettingsPanelHandle, SettingsPanelProps>(
  function SettingsPanel(
    {
      popoverSurfaceRef,
      isOpen,
      settings,
      onClose,
      onThemeChange,
      onSettingChange,
      onReplayGuidedTour,
      variant = 'portal',
    },
    ref,
  ) {
    const { t } = useI18n();
    const { latestVersion, updateAvailable } = useExtensionUpdateAvailable();
    const popRef = useRef<HTMLDivElement>(null);
    const changelogCloseRef = useRef<HTMLButtonElement>(null);
    const changelogModalRootRef = useRef<HTMLDivElement>(null);
    const licensesCloseRef = useRef<HTMLButtonElement>(null);
    const licensesModalRootRef = useRef<HTMLDivElement>(null);
    const changelogFetchGenRef = useRef(0);
    const closingRef = useRef(false);
    const closeFrameRef = useRef<number | null>(null);
    const closeTimerRef = useRef<number | null>(null);
    const [closing, setClosing] = useState(false);
    const [changelogModalOpen, setChangelogModalOpen] = useState(false);
    const [changelogModalClosing, setChangelogModalClosing] = useState(false);
    const [licensesModalOpen, setLicensesModalOpen] = useState(false);
    const [licensesModalClosing, setLicensesModalClosing] = useState(false);
    const [changelogLoading, setChangelogLoading] = useState(false);
    const [changelogErr, setChangelogErr] = useState<string | null>(null);
    const [changelogList, setChangelogList] = useState<ParsedChangelogRelease[] | null>(null);
    const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
    /** 設定パネル外で保持し、パネル閉鎖後も ThemeStudio を残す */
    const [themeStudioEditing, setThemeStudioEditing] = useState<CustomTheme | 'new' | null>(null);

    const resetChangelogModal = useCallback(() => {
      changelogFetchGenRef.current += 1;
      setChangelogModalOpen(false);
      setChangelogModalClosing(false);
      setChangelogLoading(false);
      setChangelogErr(null);
      setChangelogList(null);
    }, []);

    const resetLicensesModal = useCallback(() => {
      setLicensesModalOpen(false);
      setLicensesModalClosing(false);
    }, []);

    const fetchChangelog = useCallback(() => {
      const gen = ++changelogFetchGenRef.current;
      setChangelogLoading(true);
      setChangelogErr(null);
      void fetch(CHANGELOG_JSON_URL, { method: 'GET', cache: 'no-store' })
        .then(async (r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as unknown;
        })
        .then((raw) => {
          if (changelogFetchGenRef.current !== gen) return;
          const parsed = parseChangelogJson(raw);
          if (!parsed) {
            setChangelogErr(t.settings.changelogFormatError);
            setChangelogList(null);
            return;
          }
          setChangelogList(parsed);
        })
        .catch(() => {
          if (changelogFetchGenRef.current !== gen) return;
          setChangelogErr(t.settings.changelogFetchError);
          setChangelogList(null);
        })
        .finally(() => {
          if (changelogFetchGenRef.current !== gen) return;
          setChangelogLoading(false);
        });
    }, [t]);

    const openChangelogModal = useCallback(() => {
      setChangelogModalClosing(false);
      setChangelogModalOpen(true);
      setChangelogList(null);
      setChangelogErr(null);
      fetchChangelog();
    }, [fetchChangelog]);

    /** フェードアウト後に `resetChangelogModal` で DOM を外す */
    const requestCloseChangelogModal = useCallback(() => {
      if (!changelogModalOpen || changelogModalClosing) return;
      setChangelogModalClosing(true);
    }, [changelogModalOpen, changelogModalClosing]);

    const openLicensesModal = useCallback(() => {
      setLicensesModalClosing(false);
      setLicensesModalOpen(true);
    }, []);

    const requestCloseLicensesModal = useCallback(() => {
      if (!licensesModalOpen || licensesModalClosing) return;
      setLicensesModalClosing(true);
    }, [licensesModalOpen, licensesModalClosing]);

    useEffect(() => {
      if (!changelogModalClosing) return;
      const el = changelogModalRootRef.current;
      const finish = () => {
        resetChangelogModal();
      };
      if (!el) {
        finish();
        return;
      }
      const ms = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 30 : 220;
      const timer = window.setTimeout(finish, ms);
      const onAnimEnd = (e: AnimationEvent) => {
        if (e.target !== el) return;
        window.clearTimeout(timer);
        el.removeEventListener('animationend', onAnimEnd);
        finish();
      };
      el.addEventListener('animationend', onAnimEnd);
      return () => {
        window.clearTimeout(timer);
        el.removeEventListener('animationend', onAnimEnd);
      };
    }, [changelogModalClosing, resetChangelogModal]);

    useEffect(() => {
      if (!licensesModalClosing) return;
      const el = licensesModalRootRef.current;
      const finish = () => {
        resetLicensesModal();
      };
      if (!el) {
        finish();
        return;
      }
      const ms = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 30 : 220;
      const timer = window.setTimeout(finish, ms);
      const onAnimEnd = (e: AnimationEvent) => {
        if (e.target !== el) return;
        window.clearTimeout(timer);
        el.removeEventListener('animationend', onAnimEnd);
        finish();
      };
      el.addEventListener('animationend', onAnimEnd);
      return () => {
        window.clearTimeout(timer);
        el.removeEventListener('animationend', onAnimEnd);
      };
    }, [licensesModalClosing, resetLicensesModal]);

    useEffect(() => {
      if (!isOpen) resetChangelogModal();
      if (!isOpen) resetLicensesModal();
    }, [isOpen, resetChangelogModal, resetLicensesModal]);

    useLayoutEffect(() => {
      if (!changelogModalOpen || changelogModalClosing) return;
      const btn = changelogCloseRef.current;
      if (btn) btn.focus();
    }, [changelogModalOpen, changelogModalClosing]);

    useLayoutEffect(() => {
      if (!licensesModalOpen || licensesModalClosing) return;
      const btn = licensesCloseRef.current;
      if (btn) btn.focus();
    }, [licensesModalOpen, licensesModalClosing]);

    const finishClose = useCallback(() => {
      if (!closingRef.current) return;
      closingRef.current = false;
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (closeFrameRef.current !== null) {
        window.cancelAnimationFrame(closeFrameRef.current);
        closeFrameRef.current = null;
      }
      setClosing(false);
      onClose();
    }, [onClose]);

    // 閉じる操作と同じイベント内でブラウザのアニメーションを開始する。
    // React の再描画や CSS class の反映順に依存させない。
    const requestClose = useCallback(() => {
      resetChangelogModal();
      resetLicensesModal();
      if (!isOpen || closingRef.current) return;
      closingRef.current = true;
      setClosing(true);

      const dialog = popRef.current?.querySelector<HTMLElement>('.p-settings-dialog') ?? null;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!dialog) {
        closeTimerRef.current = window.setTimeout(finishClose, 300);
        return;
      }

      const duration = reduceMotion ? 140 : 240;
      const startedAt = performance.now();
      dialog.style.opacity = '1';
      dialog.style.willChange = reduceMotion ? 'opacity' : 'opacity, transform';
      if (!reduceMotion) dialog.style.transform = 'translateY(0) scale(1)';

      const renderCloseFrame = (now: number) => {
        if (!closingRef.current) return;
        const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
        const eased = progress * progress;
        dialog.style.opacity = String(1 - eased);
        if (!reduceMotion) {
          dialog.style.transform = `translateY(${-8 * eased}px) scale(${1 - 0.04 * eased})`;
        }
        if (progress < 1) {
          closeFrameRef.current = window.requestAnimationFrame(renderCloseFrame);
          return;
        }
        finishClose();
      };
      closeFrameRef.current = window.requestAnimationFrame(renderCloseFrame);
      closeTimerRef.current = window.setTimeout(finishClose, duration + 80);
    }, [finishClose, isOpen, resetChangelogModal, resetLicensesModal]);

    useImperativeHandle(ref, () => ({ requestClose }), [requestClose]);

    const openThemeStudio = useCallback(
      (theme: CustomTheme | 'new') => {
        setThemeStudioEditing(theme);
        // 実画面プレビューのため設定ポップを閉じる（スタジオは親 state で維持）
        requestClose();
      },
      [requestClose],
    );

    // 親から閉じられた場合や unmount 時に、保留中の終了処理を破棄する。
    useEffect(() => {
      if (isOpen) return;
      closingRef.current = false;
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (closeFrameRef.current !== null) {
        window.cancelAnimationFrame(closeFrameRef.current);
        closeFrameRef.current = null;
      }
      setClosing(false);
    }, [isOpen]);

    useEffect(
      () => () => {
        if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
        if (closeFrameRef.current !== null) window.cancelAnimationFrame(closeFrameRef.current);
      },
      [],
    );

    // 設定ボタン基準で viewport 内に収める（#portal-overlay .p-settings-pop の left:0 より CSS 変数を優先）。
    useLayoutEffect(() => {
      if (!isOpen) return;
      const el = popRef.current;
      if (!el) return;
      const dialog = el.querySelector('.p-settings-dialog') as HTMLElement | null;

      function clamp() {
        const anchor = document.getElementById('p-open-settings');
        if (!anchor) return;
        layoutSettingsPopover(el!, anchor, dialog);
      }

      clamp();
      const raf = window.requestAnimationFrame(clamp);
      window.addEventListener('resize', clamp);
      window.addEventListener('scroll', clamp, true);
      const headerActions = document.querySelector('#portal-overlay .p-header-actions');
      const roHeader = new ResizeObserver(clamp);
      if (headerActions instanceof HTMLElement) roHeader.observe(headerActions);
      const roDialog = new ResizeObserver(clamp);
      if (dialog) roDialog.observe(dialog);
      return () => {
        window.cancelAnimationFrame(raf);
        window.removeEventListener('resize', clamp);
        window.removeEventListener('scroll', clamp, true);
        roHeader.disconnect();
        roDialog.disconnect();
        clearSettingsPopoverLayout(el, dialog);
      };
    }, [isOpen, activeTab, updateAvailable, latestVersion, variant]);

    // パネル外クリックで閉じる（設定ボタン自体はヘッダー側でトグル処理するため除外）
    useEffect(() => {
      if (!isOpen || closing) return;
      const sel = `#${PORTAL_DOM.overlayRoot}`;
      const root = (popRef.current?.closest(sel) ??
        document.getElementById(PORTAL_DOM.overlayRoot)) as HTMLElement | null;
      if (!root) return;
      function onPointerDown(e: PointerEvent) {
        const t = e.target as Node;
        if (document.getElementById('p-theme-studio-root')) return;
        if (popRef.current?.contains(t)) return;
        if (document.getElementById('p-changelog-modal-root')?.contains(t)) return;
        if (document.getElementById('p-licenses-modal-root')?.contains(t)) return;
        if (document.getElementById('p-open-settings')?.contains(t)) return;
        requestClose();
      }
      root.addEventListener('pointerdown', onPointerDown);
      return () => root.removeEventListener('pointerdown', onPointerDown);
    }, [isOpen, closing, requestClose]);

    function assignPopSurface(node: HTMLDivElement | null): void {
      popRef.current = node;
      const r = popoverSurfaceRef;
      if (r == null) return;
      if (typeof r === 'function') r(node);
      else (r as RefObject<HTMLDivElement | null>).current = node;
    }

    // Escape キー：モーダル優先で閉じる → 設定パネル
    useEffect(() => {
      if (!isOpen) return;
      function onKeyDown(e: KeyboardEvent) {
        if (e.key !== 'Escape') return;
        if (document.getElementById('p-theme-studio-root')) return;
        if (changelogModalClosing) return;
        if (licensesModalClosing) return;
        if (licensesModalOpen) {
          e.preventDefault();
          requestCloseLicensesModal();
          return;
        }
        if (changelogModalOpen) {
          e.preventDefault();
          requestCloseChangelogModal();
          return;
        }
        requestClose();
      }
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }, [
      isOpen,
      changelogModalOpen,
      changelogModalClosing,
      licensesModalOpen,
      licensesModalClosing,
      requestCloseChangelogModal,
      requestCloseLicensesModal,
      requestClose,
    ]);

    const overlayEl =
      typeof document !== 'undefined' ? document.getElementById(PORTAL_DOM.overlayRoot) : null;

    const changelogModalMounted = changelogModalOpen || changelogModalClosing;
    const licensesModalMounted = licensesModalOpen || licensesModalClosing;
    const changelogModal = (
      <SettingsChangelogModal
        overlayEl={overlayEl}
        mounted={changelogModalMounted}
        closing={changelogModalClosing}
        loading={changelogLoading}
        err={changelogErr}
        list={changelogList}
        modalRootRef={changelogModalRootRef}
        closeButtonRef={changelogCloseRef}
        onRequestClose={requestCloseChangelogModal}
      />
    );
    const licensesModal = (
      <SettingsLicensesModal
        overlayEl={overlayEl}
        mounted={licensesModalMounted}
        closing={licensesModalClosing}
        modalRootRef={licensesModalRootRef}
        closeButtonRef={licensesCloseRef}
        onRequestClose={requestCloseLicensesModal}
      />
    );
    const legalSection = (
      <div className="p-settings-section p-settings-section-licenses p-settings-section--about">
        <div className="p-settings-section-title">{t.settings.about}</div>
        <div className="p-settings-action-stack">
          <div className="p-settings-row p-settings-row-actions p-settings-tour-replay">
            <button
              type="button"
              className="p-settings-tour-replay-btn"
              onClick={openLicensesModal}
            >
              {t.settings.openLicenses}
            </button>
          </div>
          <div className="p-settings-row p-settings-row-actions p-settings-tour-replay">
            <a
              className="p-settings-tour-replay-btn"
              href="https://kcg-portal-redesign-project-web.vercel.app/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.settings.openPrivacyPolicy}
            </a>
          </div>
        </div>
      </div>
    );

    const settingsPop =
      isOpen || closing ? (
        <div
          ref={assignPopSurface}
          className={`p-settings-pop${closing ? ' is-closing' : ''}`}
          id="p-settings-pop"
          aria-hidden={!isOpen}
        >
          <div
            className="p-settings-dialog"
            id="p-settings-dialog"
            role="dialog"
            aria-modal={false}
            aria-labelledby="p-settings-heading"
            tabIndex={-1}
          >
            <div className="p-settings-nav">
              <h2 id="p-settings-heading">{t.settings.title}</h2>
              {variant === 'portal' ? (
                <div className="p-settings-tabs" role="tablist" aria-label={t.settings.title}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'appearance'}
                    className={activeTab === 'appearance' ? 'is-active' : undefined}
                    onClick={() => setActiveTab('appearance')}
                  >
                    {t.settings.general}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'connections'}
                    className={activeTab === 'connections' ? 'is-active' : undefined}
                    onClick={() => setActiveTab('connections')}
                  >
                    {t.settings.connections}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'support'}
                    className={activeTab === 'support' ? 'is-active' : undefined}
                    onClick={() => setActiveTab('support')}
                  >
                    {t.settings.support}
                  </button>
                </div>
              ) : null}
            </div>

            {updateAvailable && latestVersion && extensionVersion ? (
              <div className="p-settings-update-callout" role="status" aria-live="polite">
                <p className="p-settings-update-callout-title">{t.settings.updateAvailableTitle}</p>
                <p className="p-settings-update-callout-body">
                  {t.settings.updateAvailableBody(extensionVersion, latestVersion)}
                </p>
                <p className="p-settings-update-callout-hint">{t.settings.updateAvailableHint}</p>
              </div>
            ) : null}

            {variant === 'portal' ? (
              <>
                <div className="p-settings-tab-panel" role="tabpanel" key={activeTab}>
                  {activeTab === 'appearance' ? (
                    <>
                      <SettingsThemeSection
                        settings={settings}
                        onThemeChange={onThemeChange}
                        onEditorOpen={openThemeStudio}
                      />
                      <SettingsLanguageSection
                        settings={settings}
                        onSettingChange={onSettingChange}
                      />
                      <SettingsFontSection settings={settings} onSettingChange={onSettingChange} />
                      <SettingsPortalOnlySections
                        group="appearance"
                        settings={settings}
                        onSettingChange={onSettingChange}
                        onReplayGuidedTour={onReplayGuidedTour}
                        onOpenChangelog={openChangelogModal}
                      />
                    </>
                  ) : null}

                  {activeTab === 'connections' ? (
                    <>
                      <SettingsPortalOnlySections
                        group="connections"
                        settings={settings}
                        onSettingChange={onSettingChange}
                        onReplayGuidedTour={onReplayGuidedTour}
                        onOpenChangelog={openChangelogModal}
                      />
                      <SettingsCplanSection settings={settings} onSettingChange={onSettingChange} />
                      <SettingsWebMailSection
                        settings={settings}
                        variant={variant}
                        onSettingChange={onSettingChange}
                      />
                    </>
                  ) : null}

                  {activeTab === 'support' ? (
                    <>
                      <SettingsPortalOnlySections
                        group="support"
                        settings={settings}
                        onSettingChange={onSettingChange}
                        onReplayGuidedTour={onReplayGuidedTour}
                        onOpenChangelog={openChangelogModal}
                      />
                      <SettingsFeedbackSection />
                      {legalSection}
                    </>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <SettingsLanguageSection settings={settings} onSettingChange={onSettingChange} />
                <SettingsFontSection settings={settings} onSettingChange={onSettingChange} />
                <SettingsThemeSection
                  settings={settings}
                  onThemeChange={onThemeChange}
                  onEditorOpen={openThemeStudio}
                />
                <SettingsWebMailSection
                  settings={settings}
                  variant={variant}
                  onSettingChange={onSettingChange}
                />
                <SettingsFeedbackSection />
                <SettingsHome2ChangelogSection onOpenChangelog={openChangelogModal} />
                {legalSection}
              </>
            )}

            {extensionVersion ? (
              <div className="p-settings-footer">
                <p className="p-settings-credit" role="note">
                  Created by{' '}
                  <a
                    className="p-settings-credit-link"
                    href="https://x.com/nnnnnnn0090"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    nnnnnnn0090
                  </a>
                </p>
                <p className="p-settings-version" role="note">
                  {t.settings.version(extensionVersion)}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null;

    return (
      <>
        {settingsPop && overlayEl ? createPortal(settingsPop, overlayEl) : null}
        {themeStudioEditing ? (
          <ThemeStudio
            theme={themeStudioEditing === 'new' ? undefined : themeStudioEditing}
            baseRef={settings.theme}
            onClose={() => setThemeStudioEditing(null)}
          />
        ) : null}
        {changelogModal}
        {licensesModal}
      </>
    );
  },
);
