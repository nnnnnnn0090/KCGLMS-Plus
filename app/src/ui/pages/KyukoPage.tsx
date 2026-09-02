/**
 * 休講・補講・教室変更の一覧ページです。
 * 履修科目のみに絞り込む切替を持ちます。
 */

import { useReducer, useCallback, useEffect, useRef, useState } from 'react';
import { urls, pageFetch } from '../../lib/api';
import { currentNendo } from '../../lib/date';
import { usePortalMessage, type PortalCapturedMessage } from '../../hooks/usePortalMessage';
import {
  initialKyukoPortalState,
  reduceKyukoPortalMessage,
  pickUnderscore,
} from '../../lib/portal-messages-pages';
import {
  PORTAL_HOKO_RISHU_KEYS,
  PORTAL_KYOSHITSU_CHANGE_RISHU_KEYS,
  PORTAL_KYUKO_RISHU_KEYS,
} from '../../shared/kyoshitsu-change-portal-schema';
import { PageShell } from '../components/layout/PageShell';
import { KinoPanel } from '../components/ui/KinoPanel';
import { useI18n } from '../../i18n';

// ─── 型 ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

// ─── ヘルパー ─────────────────────────────────────────────────────────────

/** 履修 token（userId + "_isRishu"）でフィルタリングする（ポータル `arrayFilter` と同じ 2 キーのみ） */
function filterByRishuToken(
  list: Row[] | null,
  token: string,
  keys: { rishu: readonly string[]; kyoin: readonly string[] },
): Row[] {
  if (!Array.isArray(list)) return [];
  if (!token) return list.slice();
  return list.filter((item) => {
    const check = (v: unknown) => v != null && String(v).includes(token);
    return keys.rishu.some((k) => check(item[k])) || keys.kyoin.some((k) => check(item[k]));
  });
}

// ─── 行コンポーネント ─────────────────────────────────────────────────────

function KyukoRow({ row }: { row: Row }) {
  return (
    <tr>
      <td>{pickUnderscore(row, 'kyukoDate')}</td>
      <td>{pickUnderscore(row, 'yobi')}</td>
      <td>{pickUnderscore(row, 'jigen')}</td>
      <td>{pickUnderscore(row, 'kogiNm')}</td>
      <td className="p-kyuko-hide-narrow">{pickUnderscore(row, 'kyoinNms')}</td>
      <td className="p-kyuko-hide-narrow">{pickUnderscore(row, 'biko')}</td>
      <td>{pickUnderscore(row, 'kyoinCds')}</td>
      <td>{pickUnderscore(row, 'gakuseiRishuFlgKyuko')}</td>
    </tr>
  );
}

function HokoRow({ row }: { row: Row }) {
  return (
    <tr>
      <td>{pickUnderscore(row, 'hokoDate')}</td>
      <td>{pickUnderscore(row, 'hokoYobi')}</td>
      <td>{pickUnderscore(row, 'hokoJigen')}</td>
      <td>{pickUnderscore(row, 'hokoKogiNm')}</td>
      <td className="p-kyuko-hide-narrow">{pickUnderscore(row, 'hokoKyoinNms')}</td>
      <td className="p-kyuko-hide-narrow">{pickUnderscore(row, 'hokoKyoshitsuNms')}</td>
      <td className="p-kyuko-hide-narrow">{pickUnderscore(row, 'hokoBiko')}</td>
      <td>{pickUnderscore(row, 'hokoKyoinCds')}</td>
      <td>{pickUnderscore(row, 'gakuseiRishuFlgHoko')}</td>
    </tr>
  );
}

function KcRow({ row }: { row: Row }) {
  return (
    <tr>
      <td>{pickUnderscore(row, 'kcDate')}</td>
      <td>{pickUnderscore(row, 'kcYobi')}</td>
      <td>{pickUnderscore(row, 'kcJigen')}</td>
      <td>{pickUnderscore(row, 'kcKogiNm')}</td>
      <td className="p-kyuko-hide-narrow">{pickUnderscore(row, 'kcKyoinNms')}</td>
      <td className="p-kyuko-hide-narrow">{pickUnderscore(row, 'kyoshitsuNmsOld')}</td>
      <td className="p-kyuko-hide-narrow">{pickUnderscore(row, 'kyoshitsuNmsNew')}</td>
      <td className="p-kyuko-hide-narrow">{pickUnderscore(row, 'kcBiko')}</td>
      <td>{pickUnderscore(row, 'kcKyoinCds')}</td>
      <td>{pickUnderscore(row, 'gakuseiRishuFlgKc')}</td>
    </tr>
  );
}

/** ローディング/空/データ の 3 状態を切り替えるテーブル tbody ヘルパー */
function TableBody({
  rows,
  emptyMsg,
  colSpan,
  RowComp,
}: {
  rows: Row[] | null;
  emptyMsg: string;
  colSpan: number;
  RowComp: React.ComponentType<{ row: Row }>;
}) {
  const { t } = useI18n();
  if (rows === null)
    return (
      <tr>
        <td colSpan={colSpan}>
          <p className="p-news-empty">{t.common.loading}</p>
        </td>
      </tr>
    );
  if (rows.length === 0)
    return (
      <tr>
        <td colSpan={colSpan}>
          <p className="p-news-empty">{emptyMsg}</p>
        </td>
      </tr>
    );
  return (
    <>
      {rows.map((row, i) => (
        <RowComp key={i} row={row} />
      ))}
    </>
  );
}

// ─── コンポーネント ────────────────────────────────────────────────────────

export function KyukoPage() {
  const { t } = useI18n();
  const nendo = String(currentNendo());

  const [state, dispatch] = useReducer(
    reduceKyukoPortalMessage,
    undefined,
    initialKyukoPortalState,
  );
  const { kinoData, kkRaw, hkRaw, kcRaw, rishuToken, rishuReady } = state;

  const [onlyRishu, setOnlyRishu] = useState(false);
  const didBootstrapRishu = useRef(false);
  useEffect(() => {
    if (didBootstrapRishu.current || !rishuReady || !rishuToken) return;
    didBootstrapRishu.current = true;
    setOnlyRishu(true);
  }, [rishuReady, rishuToken]);

  // 3 つのエンドポイントを並列フェッチ
  useEffect(() => {
    pageFetch(urls.kyukoInfo(nendo));
    pageFetch(urls.hokoInfo(nendo));
    pageFetch(urls.kyoshitsuChange(nendo));
  }, [nendo]);

  const handleMessage = useCallback((msg: PortalCapturedMessage) => {
    dispatch(msg);
  }, []);

  usePortalMessage(handleMessage);

  const token = onlyRishu && rishuToken ? rishuToken : '';

  const kkFiltered = token
    ? filterByRishuToken(kkRaw, token, PORTAL_KYUKO_RISHU_KEYS)
    : (kkRaw ?? []);
  const hkFiltered = token
    ? filterByRishuToken(hkRaw, token, PORTAL_HOKO_RISHU_KEYS)
    : (hkRaw ?? []);
  const kcFiltered = token
    ? filterByRishuToken(kcRaw, token, PORTAL_KYOSHITSU_CHANGE_RISHU_KEYS)
    : (kcRaw ?? []);

  return (
    <PageShell variant="news" title={t.kyukoPage.title(nendo)}>
      <KinoPanel data={kinoData} />

      <div className="p-news-page p-kyuko-page">
        <div className="p-news-primary">
          {/* ページ内ジャンプナビ */}
          <nav className="p-kyuko-jump" aria-label={t.kyukoPage.jumpAria}>
            <a className="p-nav-btn" href="#p-kyuko-section">
              {t.kyukoPage.kyukoList}
            </a>
            <a className="p-nav-btn" href="#p-hoko-section">
              {t.kyukoPage.hokoList}
            </a>
            <a className="p-nav-btn" href="#p-kc-section">
              {t.kyukoPage.classroomChangeList}
            </a>
          </nav>

          <section className="p-panel p-news-table-wrap" id="p-kyuko-section">
            <span className="p-panel-head">{t.kyukoPage.kyukoList}</span>
            <div className="p-news-table-scroll">
              <table className="p-news-table p-kyuko-table" aria-label={t.kyukoPage.kyukoList}>
                <thead>
                  <tr>
                    <th scope="col">{t.kyukoPage.date}</th>
                    <th scope="col">{t.kyukoPage.weekday}</th>
                    <th scope="col">{t.kyukoPage.period}</th>
                    <th scope="col">{t.kyukoPage.lecture}</th>
                    <th scope="col" className="p-kyuko-hide-narrow">
                      {t.kyukoPage.teacher}
                    </th>
                    <th scope="col" className="p-kyuko-hide-narrow">
                      {t.kyukoPage.note}
                    </th>
                    <th scope="col">{t.kyukoPage.teacherCode}</th>
                    <th scope="col">{t.kyukoPage.rishuFlag}</th>
                  </tr>
                </thead>
                <tbody>
                  <TableBody
                    rows={kkRaw === null ? null : kkFiltered}
                    emptyMsg={t.kyukoPage.emptyKyuko}
                    colSpan={8}
                    RowComp={KyukoRow}
                  />
                </tbody>
              </table>
            </div>
          </section>

          <section className="p-panel p-news-table-wrap" id="p-hoko-section">
            <span className="p-panel-head">{t.kyukoPage.hokoList}</span>
            <div className="p-news-table-scroll">
              <table className="p-news-table p-kyuko-table" aria-label={t.kyukoPage.hokoList}>
                <thead>
                  <tr>
                    <th scope="col">{t.kyukoPage.date}</th>
                    <th scope="col">{t.kyukoPage.weekday}</th>
                    <th scope="col">{t.kyukoPage.period}</th>
                    <th scope="col">{t.kyukoPage.lecture}</th>
                    <th scope="col" className="p-kyuko-hide-narrow">
                      {t.kyukoPage.teacher}
                    </th>
                    <th scope="col" className="p-kyuko-hide-narrow">
                      {t.kyukoPage.classroom}
                    </th>
                    <th scope="col" className="p-kyuko-hide-narrow">
                      {t.kyukoPage.note}
                    </th>
                    <th scope="col">{t.kyukoPage.teacherCode}</th>
                    <th scope="col">{t.kyukoPage.rishuFlag}</th>
                  </tr>
                </thead>
                <tbody>
                  <TableBody
                    rows={hkRaw === null ? null : hkFiltered}
                    emptyMsg={t.kyukoPage.emptyHoko}
                    colSpan={9}
                    RowComp={HokoRow}
                  />
                </tbody>
              </table>
            </div>
          </section>

          <section className="p-panel p-news-table-wrap" id="p-kc-section">
            <span className="p-panel-head">{t.kyukoPage.classroomChangeList}</span>
            <div className="p-news-table-scroll">
              <table
                className="p-news-table p-kyuko-table"
                aria-label={t.kyukoPage.classroomChangeList}
              >
                <thead>
                  <tr>
                    <th scope="col">{t.kyukoPage.date}</th>
                    <th scope="col">{t.kyukoPage.weekday}</th>
                    <th scope="col">{t.kyukoPage.period}</th>
                    <th scope="col">{t.kyukoPage.lecture}</th>
                    <th scope="col" className="p-kyuko-hide-narrow">
                      {t.kyukoPage.teacher}
                    </th>
                    <th scope="col" className="p-kyuko-hide-narrow">
                      {t.kyukoPage.before}
                    </th>
                    <th scope="col" className="p-kyuko-hide-narrow">
                      {t.kyukoPage.after}
                    </th>
                    <th scope="col" className="p-kyuko-hide-narrow">
                      {t.kyukoPage.note}
                    </th>
                    <th scope="col">{t.kyukoPage.teacherCode}</th>
                    <th scope="col">{t.kyukoPage.rishuFlag}</th>
                  </tr>
                </thead>
                <tbody>
                  <TableBody
                    rows={kcRaw === null ? null : kcFiltered}
                    emptyMsg={t.kyukoPage.emptyClassroomChange}
                    colSpan={10}
                    RowComp={KcRow}
                  />
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* 絞り込みサイドバー */}
        <aside className="p-news-aside" aria-label={t.kyukoPage.filterAria}>
          <h2 className="p-news-filter-page-title">{t.newsPage.filterTitle}</h2>
          <div className="p-news-mat">
            <label className="p-settings-row tw-m-0 tw-cursor-pointer tw-py-[.35rem]">
              <input
                type="checkbox"
                disabled={!rishuReady}
                checked={onlyRishu}
                onChange={(e) => setOnlyRishu(e.target.checked)}
              />
              <span>{t.kyukoPage.onlyMyCourses}</span>
            </label>
            {!rishuReady && <p className="p-news-mat-hint">{t.kyukoPage.waitForApi}</p>}
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
