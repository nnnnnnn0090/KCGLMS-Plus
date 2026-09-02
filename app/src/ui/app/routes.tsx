/**
 * ルートに応じたページコンポーネントを返すアウトレット。
 * ホーム以外は遅延ロードして初期バンドルサイズを削減する。
 */

import { lazy, Suspense } from 'react';
import { PAGE } from '../../shared/constants';
import type { PortalAppRoute } from './types';
import { isHome2MailRoute } from './types';
import type { Settings } from '../../context/settings';
import { PageShell } from '../components/layout/PageShell';
import { HomePage } from '../pages/HomePage';
import { Home2WebMailLoginPage } from '../pages/Home2WebMailLoginPage';
import { Home2WebMailMailboxPage } from '../pages/Home2WebMailMailboxPage';
import { Home2WebMailReadPage } from '../pages/Home2WebMailReadPage';
import { Home2WebMailSendPage } from '../pages/Home2WebMailSendPage';
import { useI18n } from '../../i18n';

// 遅延ロード（ホームページ以外）
const NewsPage = lazy(() => import('../pages/NewsPage').then((m) => ({ default: m.NewsPage })));
const DetailPage = lazy(() =>
  import('../pages/DetailPage').then((m) => ({ default: m.DetailPage })),
);
const KyukoPage = lazy(() => import('../pages/KyukoPage').then((m) => ({ default: m.KyukoPage })));
const SurveyPage = lazy(() =>
  import('../pages/SurveyPage').then((m) => ({ default: m.SurveyPage })),
);

function PageFallback() {
  const { t } = useI18n();
  return (
    <PageShell hideHead>
      <p className="p-empty">{t.common.loading}</p>
    </PageShell>
  );
}

/** ルートに応じたページコンポーネント。レイアウトは App が担当する。 */
export function PortalPageOutlet({
  route,
  settings,
}: {
  route: PortalAppRoute;
  settings: Settings;
}) {
  if (isHome2MailRoute(route)) {
    if (route.layout === 'full') return <Home2WebMailLoginPage />;
    if (route.layout === 'mailHead') return <Home2WebMailMailboxPage />;
    if (route.layout === 'readMail') return <Home2WebMailReadPage />;
    if (route.layout === 'sendMail') return <Home2WebMailSendPage />;
    return null;
  }

  switch (route.page) {
    case PAGE.HOME:
      return <HomePage settings={settings} />;
    case PAGE.NEWS:
      return (
        <Suspense fallback={<PageFallback />}>
          <NewsPage />
        </Suspense>
      );
    case PAGE.DETAIL:
      return (
        <Suspense fallback={<PageFallback />}>
          <DetailPage newsDetailId={route.detailId ?? ''} />
        </Suspense>
      );
    case PAGE.KYUKO:
      return (
        <Suspense fallback={<PageFallback />}>
          <KyukoPage />
        </Suspense>
      );
    case PAGE.SURVEY:
      return (
        <Suspense fallback={<PageFallback />}>
          <SurveyPage />
        </Suspense>
      );
    default:
      return null;
  }
}
