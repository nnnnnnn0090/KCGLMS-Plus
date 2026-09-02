/**
 * ホーム（ダッシュボード）ページです。
 * 授業カレンダー・課題カレンダー・お知らせ・ショートカットをまとめて表示します。
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { MSG, SK } from '../../shared/constants';
import storage from '../../lib/storage';
import { urls } from '../../lib/api';
import type { Settings } from '../../context/settings';
import { useSettings } from '../../context/settings';
import { useCourses } from '../../context/courses';
import { usePortalDom } from '../../context/portalDom';
import { useHomeStorageBootstrap } from '../../hooks/useHomeStorageBootstrap';
import { useHomePortalInbox } from '../../hooks/useHomePortalInbox';
import { useLastLogin } from '../../hooks/useLastLogin';
import { useDeveloperNotice } from '../../hooks/useDeveloperNotice';
import { useDeveloperSurvey } from '../../hooks/useDeveloperSurvey';
import { PageShell } from '../components/layout/PageShell';
import { KinoPanel } from '../components/ui/KinoPanel';
import { NewsList } from '../components/ui/NewsList';
import { NewsTabs, type NewsTab } from '../components/ui/NewsTabs';
import { isLostPropertyNews } from '../../lib/news-classification';
import { DeveloperSurveyPanel } from '../components/ui/DeveloperSurveyPanel';
import { HomeCornerCharacter } from '../components/ui/HomeCornerCharacter';
import { LinkEditor } from '../components/ui/LinkEditor';
import { CalendarPanel, AssignmentCalendar, type DuePayload } from '../calendar';
import { useI18n } from '../../i18n';
import { renderMarkdown } from '../../lib/markdown';
import {
  PROMOTION_DEMO_MODE,
  PROMOTION_DEMO_NEWS,
  createPromotionDemoAssignments,
  createPromotionDemoKogiCalendar,
  promotionDemoTodayIso,
} from '../../shared/promotion-demo';

// ─── 型 ───────────────────────────────────────────────────────────────────

interface HomePageProps {
  settings: Settings;
}

/** オーバーレイのスクロールルート内で、要素が縦方向ほぼ中央に来るよう scrollTop を計算する */
function scrollElementToVerticalCenter(
  scroller: HTMLElement,
  target: HTMLElement,
  behavior: ScrollBehavior,
): void {
  const cRect = scroller.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  const visibleOffsetTop = tRect.top - cRect.top;
  const nextTop =
    scroller.scrollTop + visibleOffsetTop - scroller.clientHeight / 2 + tRect.height / 2;
  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const clamped = Math.max(0, Math.min(nextTop, maxScroll));
  // `smooth` は操作中のホイール等と合成されてずれることがある。瞬時合わせは scrollTop 直指定が確実。
  if (behavior === 'auto') {
    scroller.scrollTop = clamped;
  } else {
    scroller.scrollTo({ top: clamped, behavior });
  }
}

// ─── コンポーネント ────────────────────────────────────────────────────────

export function HomePage({ settings }: HomePageProps) {
  const { language, t } = useI18n();
  const { settingsReady } = useSettings();
  const { courses } = useCourses();
  const { overlayRoot } = usePortalDom();

  const { kinoData, kogiNews, newTopicsItems, linkItems, userLinkRecords } = useHomePortalInbox();
  const demoKogiCalendar = useMemo(
    () => (PROMOTION_DEMO_MODE ? createPromotionDemoKogiCalendar() : undefined),
    [],
  );
  const demoAssignmentPayload = useMemo(
    () => (PROMOTION_DEMO_MODE ? createPromotionDemoAssignments() : null),
    [],
  );
  const demoTodayIso = PROMOTION_DEMO_MODE ? promotionDemoTodayIso() : undefined;
  const displayedNews = PROMOTION_DEMO_MODE ? PROMOTION_DEMO_NEWS : newTopicsItems;

  const [assignmentPayload, setAssignmentPayload] = useState<DuePayload | null>(null);
  const [linksEditing, setLinksEditing] = useState(false);
  const [newsTab, setNewsTab] = useState<NewsTab>('general');

  const tabbedNews = displayedNews.filter((item) =>
    newsTab === 'lostProperty' ? isLostPropertyNews(item) : !isLostPropertyNews(item),
  );

  useHomeStorageBootstrap({ settingsReady, setAssignmentPayload });

  // King LMS 課題同期でホームへ戻った直後、課題カレンダーへスクロール（bridge が立てたフラグ）
  useEffect(() => {
    let cancelled = false;
    let settleTimer: number | null = null;

    void storage.get(SK.portalScrollToAssignmentOnce).then((snap) => {
      if (cancelled) return;
      if (!snap[SK.portalScrollToAssignmentOnce]) return;
      void storage.set({ [SK.portalScrollToAssignmentOnce]: false });

      const run = () => {
        const el = document.getElementById('p-assignment-calendar-panel');
        if (!(el instanceof HTMLElement)) return;
        scrollElementToVerticalCenter(overlayRoot, el, 'auto');
      };

      const motionReduce =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;
          run();
          // パネル入場（base.css の --p-enter-dur）後に再計測。初回はアニメ中の矩形でズレやすい。
          if (!motionReduce) {
            settleTimer = window.setTimeout(() => {
              settleTimer = null;
              if (cancelled) return;
              run();
            }, 480);
          }
        });
      });
    });

    return () => {
      cancelled = true;
      if (settleTimer != null) window.clearTimeout(settleTimer);
    };
  }, [overlayRoot]);

  const kogiDisplayDeps = useMemo(
    () =>
      courses
        .map((c) => `${String(c.displayName ?? '')}\t${String(c.externalAccessUrl ?? '')}`)
        .join('\n'),
    [courses],
  );
  const getKingLmsCourses = useCallback(() => courses, [courses]);
  const lastLogin = useLastLogin();
  const { notice: developerNotice, lang: noticeLang } = useDeveloperNotice(language);
  const developerSurvey = useDeveloperSurvey(language);

  const developerNoticeTitle =
    developerNotice?.byLang?.[noticeLang]?.title || t.developerNotice.fallbackTitle;
  const developerNoticeMessage = developerNotice?.byLang?.[noticeLang]?.message ?? '';
  const developerNoticeHtml = useMemo(
    () => (developerNoticeMessage ? renderMarkdown(developerNoticeMessage) : ''),
    [developerNoticeMessage],
  );

  return (
    <PageShell
      title={t.home.title}
      headExtra={lastLogin ? <span className="p-last-login">{lastLogin}</span> : undefined}
    >
      <div className="p-stack">
        {developerNotice ? (
          <section className="p-panel">
            <span className="p-panel-head p-developer-notice-head">
              <span className="p-developer-notice-head-title">{developerNoticeTitle}</span>
            </span>
            {developerNoticeMessage ? (
              <div className="p-panel-body" id="p-developer-notice">
                <div
                  className="p-developer-notice-markdown"
                  dangerouslySetInnerHTML={{ __html: developerNoticeHtml }}
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {developerSurvey.ready && developerSurvey.survey ? (
          <DeveloperSurveyPanel
            survey={developerSurvey.survey}
            answered={developerSurvey.answered}
            submitting={developerSurvey.submitting}
            submitted={developerSurvey.submitted}
            submitError={developerSurvey.error}
            labels={t.developerSurvey}
            onSubmit={developerSurvey.submit}
          />
        ) : null}

        <KinoPanel data={kinoData} />

        {/* 授業カレンダー */}
        <CalendarPanel
          calUrl={urls.kogiCalendar}
          calKind="kogi"
          titles={{ week: t.home.kogiWeek, month: t.home.kogiMonth }}
          modeGroupLabel={t.calendar.modeGroup(t.home.kogiCalendar)}
          msgType={MSG.kogiCalendar}
          getKingLmsCourses={getKingLmsCourses}
          kogiDisplayDeps={kogiDisplayDeps}
          sleepMascotSlot
          demoItems={demoKogiCalendar}
          demoTodayIso={demoTodayIso}
        />

        {/* 課題カレンダー */}
        {!settings.hideAssignmentCalendar ? (
          <AssignmentCalendar
            payload={demoAssignmentPayload ?? assignmentPayload}
            titles={{ week: t.home.assignmentWeek, month: t.home.assignmentMonth }}
            demoTodayIso={demoTodayIso}
          />
        ) : null}

        {/* 補修カレンダー */}
        <CalendarPanel
          calUrl={urls.hoshuCalendar}
          calKind="hoshu"
          titles={{ week: t.home.hoshuWeek, month: t.home.hoshuMonth }}
          modeGroupLabel={t.calendar.modeGroup(t.home.hoshuCalendar)}
          msgType={MSG.hoshuCalendar}
          hideWhenEmpty
        />

        {/* キャンパスカレンダー */}
        <CalendarPanel
          calUrl={urls.campusCalendar}
          calKind="campus"
          titles={{ week: t.home.campusWeek, month: t.home.campusMonth }}
          modeGroupLabel={t.calendar.modeGroup(t.home.campusCalendar)}
          msgType={MSG.campusCalendar}
          hideWhenEmpty
        />

        {/* 授業に関するお知らせ */}
        <section className="p-panel">
          <span className="p-panel-head">{t.home.kogiNews}</span>
          <div className="p-panel-body" id="p-kogi-news">
            <NewsList items={kogiNews} />
          </div>
        </section>

        {/* お知らせ & ショートカット */}
        <div className="p-grid">
          <section className="p-panel">
            <span className="p-panel-head">{t.home.news}</span>
            <div className="p-panel-body" id="p-news">
              <NewsTabs
                activeTab={newsTab}
                generalLabel={t.newsPage.generalTab}
                lostPropertyLabel={t.newsPage.lostPropertyTab}
                onChange={setNewsTab}
              />
              <NewsList items={tabbedNews} />
            </div>
          </section>
          <section className="p-panel p-panel-links">
            <span className="p-panel-head">
              <span>{t.home.shortcuts}</span>
              <button
                type="button"
                className={`p-link-edit-btn${linksEditing ? ' is-active' : ''}`}
                id="p-link-edit-btn"
                onClick={() => setLinksEditing((v) => !v)}
              >
                {linksEditing ? t.common.done : t.common.edit}
              </button>
            </span>
            <div className={`p-panel-body${linksEditing ? ' is-editing' : ''}`} id="p-links">
              <LinkEditor items={linkItems} userLinks={userLinkRecords} editing={linksEditing} />
            </div>
          </section>
        </div>
      </div>
      {settings.showHomeCornerCharacter ? <HomeCornerCharacter /> : null}
    </PageShell>
  );
}
