/**
 * お知らせ一覧ページです。
 * 年度切替、配信元・カテゴリ・キーワードによる絞り込みを行います。
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { urls, pageFetch, portalLastLoginRaw } from '../../lib/api';
import { currentNendo } from '../../lib/date';
import { usePortalMessage, type PortalCapturedMessage } from '../../hooks/usePortalMessage';
import type { NewsListItem } from '../../shared/types';
import {
  reduceNewsListPortalMessage,
  type NewsListPortalState,
} from '../../lib/portal-messages-pages';
import {
  parsePortalNewsListFilters,
  type ParsedNewsListFilters,
} from '../../shared/news-list-filters';
import { PageShell } from '../components/layout/PageShell';
import { KinoPanel } from '../components/ui/KinoPanel';
import { NewsList } from '../components/ui/NewsList';
import { NewsTabs, type NewsTab } from '../components/ui/NewsTabs';
import { useI18n } from '../../i18n';
import { isLostPropertyNews } from '../../lib/news-classification';

type NewsItem = NewsListItem;

// ─── コンポーネント ────────────────────────────────────────────────────────

export function NewsPage() {
  const { t } = useI18n();
  const y0 = new Date().getFullYear();
  const initialNendo = String(currentNendo());

  const [nendo, setNendo] = useState(initialNendo);
  const [portalInbox, setPortalInbox] = useState<NewsListPortalState>({
    kinoData: null,
    raw: null,
  });
  const { kinoData, raw } = portalInbox;
  const [checkedSenders, setCheckedSenders] = useState<Set<string>>(new Set());
  const [checkedCats, setCheckedCats] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [newsTab, setNewsTab] = useState<NewsTab>('general');
  const [filterOptions, setFilterOptions] = useState<ParsedNewsListFilters>(() =>
    parsePortalNewsListFilters(),
  );

  // 応答が古い年度のものでないかを確認するために保持する
  const pendingNendo = useRef<string | null>(initialNendo);

  // 素ページの「絞り込み条件」DOM が後から出る場合に数回まで再読み取りする
  useEffect(() => {
    let cancelled = false;
    let timeoutId = 0;
    let tries = 0;
    function schedule() {
      if (cancelled) return;
      const parsed = parsePortalNewsListFilters();
      setFilterOptions(parsed);
      tries++;
      const done = (parsed.senders.length > 0 && parsed.categories.length > 0) || tries >= 50;
      if (!done) timeoutId = window.setTimeout(schedule, 100);
    }
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  // 初回フェッチ
  useEffect(() => {
    pageFetch(urls.deliveredNendo(initialNendo, portalLastLoginRaw()));
  }, [initialNendo]);

  // 年度切替フェッチ
  function requestNendo(n: string) {
    setNendo(n);
    setPortalInbox((p) => ({ ...p, raw: null }));
    pendingNendo.current = n;
    pageFetch(urls.deliveredNendo(n, portalLastLoginRaw()));
  }

  const handleMessage = useCallback((msg: PortalCapturedMessage) => {
    setPortalInbox((prev) => reduceNewsListPortalMessage(prev, msg, pendingNendo));
  }, []);

  usePortalMessage(handleMessage);

  // ── フィルタ処理 ─────────────────────────────────────────────────────────

  function filteredList(): NewsItem[] {
    if (!Array.isArray(raw)) return [];
    let list = raw.filter((item) =>
      newsTab === 'lostProperty' ? isLostPropertyNews(item) : !isLostPropertyNews(item),
    );
    if (checkedSenders.size > 0) {
      list = list.filter((i) => checkedSenders.has(String(i.sender ?? '')));
    }
    if (checkedCats.size > 0) {
      list = list.filter((i) => checkedCats.has(String(i.categoryCd ?? '')));
    }
    const kw = keyword.trim().toLowerCase();
    if (kw) {
      list = list.filter((i) =>
        `${i.title ?? ''} ${i.sender ?? ''} ${i.category ?? ''} ${i.newsDate ?? ''}`
          .toLowerCase()
          .includes(kw),
      );
    }
    return list;
  }

  function toggleSender(v: string) {
    setCheckedSenders((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function toggleCat(v: string) {
    setCheckedCats((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function clearFilters() {
    setCheckedSenders(new Set());
    setCheckedCats(new Set());
    setKeyword('');
  }

  const list = filteredList();
  const nendoMsg =
    raw && raw.length > 0
      ? t.newsPage.nendoShowing(nendo)
      : raw !== null
        ? t.newsPage.nendoEmpty(nendo)
        : t.common.loading;

  return (
    <PageShell variant="news" title={t.newsPage.title}>
      <KinoPanel data={kinoData} />

      <div className="p-news-page">
        <div className="p-news-primary">
          {/* 年度選択 */}
          <nav className="p-news-nendo-nav" aria-label={t.newsPage.nendoAria}>
            {Array.from({ length: 5 }, (_, k) => {
              const n = String(y0 - k);
              return (
                <button
                  key={n}
                  type="button"
                  className={`p-news-nendo-btn${n === nendo ? ' is-active' : ''}`}
                  onClick={() => requestNendo(n)}
                >
                  {t.newsPage.nendoButton(n)}
                </button>
              );
            })}
          </nav>

          <p className="p-news-nendo-msg">{nendoMsg}</p>

          <section className="p-panel">
            <span className="p-panel-head">{t.newsPage.title}</span>
            <NewsTabs
              activeTab={newsTab}
              generalLabel={t.newsPage.generalTab}
              lostPropertyLabel={t.newsPage.lostPropertyTab}
              onChange={setNewsTab}
            />
            <div className="p-panel-body" id="p-news-page-list">
              {raw === null ? (
                <p className="p-empty">{t.common.loading}</p>
              ) : (
                <NewsList items={list} emptyMsg={t.newsPage.emptyFiltered} />
              )}
            </div>
          </section>
        </div>

        {/* 絞り込みサイドバー */}
        <aside className="p-news-aside" aria-label={t.newsPage.filterAria}>
          <h2 className="p-news-filter-page-title">{t.newsPage.filterTitle}</h2>

          <div className="p-news-mat">
            <h3>{t.newsPage.senderFilter}</h3>
            <ul className="p-news-checklist">
              {filterOptions.senders.map((s, i) => (
                <li key={`${s.value}\t${i}`}>
                  <input
                    type="checkbox"
                    id={`p-nfs-${i}`}
                    checked={checkedSenders.has(s.value)}
                    onChange={() => toggleSender(s.value)}
                  />
                  <label htmlFor={`p-nfs-${i}`}>{s.label}</label>
                </li>
              ))}
            </ul>
            <p className="p-news-mat-hint">{t.newsPage.senderHint}</p>
          </div>

          <div className="p-news-mat">
            <h3>{t.newsPage.categoryFilter}</h3>
            <ul className="p-news-checklist">
              {filterOptions.categories.map((c) => (
                <li key={c.value}>
                  <input
                    type="checkbox"
                    id={`p-nfc-${c.value}`}
                    checked={checkedCats.has(c.value)}
                    onChange={() => toggleCat(c.value)}
                  />
                  <label htmlFor={`p-nfc-${c.value}`}>{c.label}</label>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-news-mat">
            <h3>{t.newsPage.keyword}</h3>
            <input
              type="search"
              className="p-news-kw"
              placeholder={t.newsPage.keywordPlaceholder}
              autoComplete="off"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          <div className="p-news-clear">
            <button type="button" className="p-news-clear-btn" onClick={clearFilters}>
              {t.newsPage.clear}
            </button>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
