/**
 * お知らせ一覧コンポーネント（ホームページのパネル用）。
 */

import type { NewsListItem } from '../../../shared/types';
import { newsHref } from '../../../lib/dom';
import { useI18n } from '../../../i18n';

export type { NewsListItem } from '../../../shared/types';

interface NewsListProps {
  items: NewsListItem[];
  emptyMsg?: string;
}

export function NewsList({ items, emptyMsg }: NewsListProps) {
  const { t } = useI18n();
  const filtered = items.filter((i) => i.title);

  if (filtered.length === 0) {
    return <p className="p-empty">{emptyMsg ?? t.newsList.empty}</p>;
  }

  return (
    <>
      {filtered.map((item) => {
        const unread = String(item.readFlg) === '0';
        const isNew = String(item.newFlg) === '1';
        const isUrgent = String(item.importanceCd) === '02';
        const id = item.id;
        const key = id != null ? String(id) : `${item.title}-${item.newsDate}`;
        const href = id != null ? newsHref(String(id)) : '#';
        const dateStr = String(item.newsDate ?? '').replace(/-/g, '/');
        return (
          <article key={key} className={`p-news${unread ? ' p-news-unread' : ''}`}>
            <a className="p-news-link" href={href}>
              <div className="p-news-meta-row">
                <div className="p-news-date-line">
                  <time dateTime={item.newsDate != null ? String(item.newsDate) : undefined}>
                    {dateStr}
                  </time>
                  {isUrgent && (
                    <span className="p-news-urgent-badge" aria-hidden="true">
                      {t.newsList.urgent}
                    </span>
                  )}
                </div>
              </div>
              <span className="p-news-title-line">
                <span className="p-news-title">{item.title}</span>
                {isNew && (
                  <span className="p-news-new-badge" aria-hidden="true">
                    NEW
                  </span>
                )}
              </span>
              <span className="p-news-meta">
                {item.sender ?? ''} · {item.category ?? ''}
              </span>
            </a>
          </article>
        );
      })}
    </>
  );
}
