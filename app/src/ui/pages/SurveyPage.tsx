/**
 * 授業評価アンケートの回答ページです。
 * 未回答のみの表示や、講義名・担当教員名のキーワード絞り込みに対応します。
 */

import { useState, useCallback, useEffect } from 'react';
import { urls, pageFetch } from '../../lib/api';
import { currentNendo } from '../../lib/date';
import { usePortalMessage, type PortalCapturedMessage } from '../../hooks/usePortalMessage';
import {
  type SurveyPortalState,
  reduceSurveyPortalMessage,
  pick,
} from '../../lib/portal-messages-pages';
import { PageShell } from '../components/layout/PageShell';
import { KinoPanel } from '../components/ui/KinoPanel';
import { useI18n } from '../../i18n';

// ─── 型 ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

// ─── ヘルパー ─────────────────────────────────────────────────────────────

/** null も含めて最初に存在するフィールドを文字列で返す（回答状態フラグ用） */
function pickRaw(obj: Row | null, keys: string[]): string {
  if (!obj) return '';
  for (const k of keys) {
    if (obj[k] != null) return String(obj[k]);
  }
  return '';
}

function formatDeadline(raw: string, locale: string): string {
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?/);
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/** アンケート一覧行を一度だけ pick して束ねる（API 確定キー） */
function parseSurveyRow(row: Row) {
  return {
    nendo: pick(row, ['nendo']),
    questionnaireCd: pick(row, ['questionnaireCd']),
    kogiCd: pick(row, ['kogiCd']),
    periodCd: pick(row, ['periodCd']),
    periodNo: pick(row, ['periodNo']),
    kogi: pick(row, ['kogi']),
    yobiRNm: pick(row, ['yobiRNm']),
    jigenRNm: pick(row, ['jigenRNm']),
    kyoinFullNm: pick(row, ['kyoinFullNm']),
    dispEndDateTime: pick(row, ['dispEndDateTime']),
  };
}

/** 現行ポータル: /Questionnaire/Detail/{nendo}/{questionnaireCd}/{kogiCd}/{periodCd}/{periodNo} */
function buildDetailHrefParsed(s: ReturnType<typeof parseSurveyRow>): string {
  const { nendo, questionnaireCd, kogiCd, periodCd, periodNo } = s;
  if (nendo && questionnaireCd && kogiCd && periodCd && periodNo) {
    try {
      return new URL(
        `/portal/Questionnaire/Detail/${encodeURIComponent(nendo)}/${encodeURIComponent(questionnaireCd)}/${encodeURIComponent(kogiCd)}/${encodeURIComponent(periodCd)}/${encodeURIComponent(periodNo)}`,
        location.origin,
      ).href;
    } catch {
      /* skip */
    }
  }
  return '';
}

/** 一覧行の安定キー（フィルタ変更時の不要な再マウントを減らす） */
function surveyRowKey(row: Row): string {
  const s = parseSurveyRow(row);
  const href = buildDetailHrefParsed(s);
  if (href) return href;
  const composite = [
    s.nendo,
    s.questionnaireCd,
    s.kogiCd,
    s.periodCd,
    s.periodNo,
    s.kogi,
    s.dispEndDateTime,
    s.kyoinFullNm,
  ].join('|');
  if (composite.replace(/\|/g, '').length > 0) return composite;
  return JSON.stringify(row);
}

function applyFilters(raw: Row[], onlyUnanswered: boolean, kogiKw: string, kyoinKw: string): Row[] {
  let list = raw.slice();
  if (onlyUnanswered) {
    list = list.filter((row) => {
      const ex = pickRaw(row, ['existsAnswer']);
      return ex.length > 0 && ex.includes('未回答');
    });
  }
  const fk = kogiKw.trim();
  if (fk) {
    list = list.filter((row) => pick(row, ['kogi']).includes(fk));
  }
  const fe = kyoinKw.trim();
  if (fe) {
    list = list.filter((row) => pick(row, ['kyoinFullNm']).includes(fe));
  }
  return list;
}

// ─── 行コンポーネント ─────────────────────────────────────────────────────

function SurveyRow({ row }: { row: Row }) {
  const { locale } = useI18n();
  const s = parseSurveyRow(row);
  const href = buildDetailHrefParsed(s);
  const deadline = formatDeadline(s.dispEndDateTime, locale);
  const { kogi, yobiRNm: yobi, jigenRNm: jigen, kyoinFullNm: kyoin } = s;
  return (
    <tr>
      <td>{href ? <a href={href}>{kogi}</a> : kogi}</td>
      <td>{yobi}</td>
      <td>{jigen}</td>
      <td>{kyoin}</td>
      <td>{deadline}</td>
    </tr>
  );
}

// ─── コンポーネント ────────────────────────────────────────────────────────

export function SurveyPage() {
  const { t } = useI18n();
  const nendo = String(currentNendo());

  const [portal, setPortal] = useState<SurveyPortalState>({ kinoData: null, raw: null });
  const { kinoData, raw } = portal;
  const [onlyUnanswered, setOnlyUnanswered] = useState(true);
  const [kogiKw, setKogiKw] = useState('');
  const [kyoinKw, setKyoinKw] = useState('');

  useEffect(() => {
    pageFetch(urls.questionnaireInfo());
  }, []);

  const handleMessage = useCallback((msg: PortalCapturedMessage) => {
    setPortal((prev) => reduceSurveyPortalMessage(prev, msg));
  }, []);

  usePortalMessage(handleMessage);

  const filtered = raw !== null ? applyFilters(raw, onlyUnanswered, kogiKw, kyoinKw) : [];
  const noData = raw !== null && raw.length === 0;

  const listTitle =
    raw === null || filtered.length > 0
      ? t.surveyPage.listShowing(nendo)
      : t.surveyPage.listEmpty(nendo);

  let tableBody: React.ReactNode;
  if (raw === null) {
    tableBody = (
      <tr>
        <td colSpan={5}>
          <p className="p-news-empty">{t.common.loading}</p>
        </td>
      </tr>
    );
  } else if (filtered.length === 0) {
    tableBody = (
      <tr>
        <td colSpan={5}>
          <p className="p-news-empty">{t.surveyPage.emptyFiltered}</p>
        </td>
      </tr>
    );
  } else {
    tableBody = filtered.map((row) => <SurveyRow key={surveyRowKey(row)} row={row} />);
  }

  return (
    <PageShell variant="news" title={t.surveyPage.title}>
      <KinoPanel data={kinoData} />

      <div className="p-news-page p-questionnaire-layout">
        <div className="p-news-primary">
          <section className="p-panel p-news-table-wrap" id="p-questionnaire-section">
            <span className="p-panel-head">{t.surveyPage.list}</span>
            <div className="p-questionnaire-subbar">
              <p className="p-questionnaire-list-title">{raw !== null ? listTitle : ''}</p>
            </div>
            {!noData && (
              <div className="p-news-table-scroll">
                <table className="p-news-table" aria-label={t.surveyPage.ariaList}>
                  <thead>
                    <tr>
                      <th scope="col">{t.surveyPage.lecture}</th>
                      <th scope="col">{t.surveyPage.weekday}</th>
                      <th scope="col">{t.surveyPage.period}</th>
                      <th scope="col">{t.surveyPage.teacher}</th>
                      <th scope="col">{t.surveyPage.deadline}</th>
                    </tr>
                  </thead>
                  <tbody>{tableBody}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* 絞り込みサイドバー */}
        <aside className="p-news-aside" aria-label={t.kyukoPage.filterAria}>
          <h2 className="p-news-filter-page-title">{t.newsPage.filterTitle}</h2>

          <div className="p-news-mat">
            <h3>{t.surveyPage.display}</h3>
            <ul className="p-news-checklist">
              <li>
                <input
                  type="checkbox"
                  id="p-questionnaire-only-unanswer"
                  checked={onlyUnanswered}
                  onChange={(e) => setOnlyUnanswered(e.target.checked)}
                />
                <label htmlFor="p-questionnaire-only-unanswer">{t.surveyPage.onlyUnanswered}</label>
              </li>
            </ul>
          </div>

          <div className="p-news-mat">
            <h3>{t.surveyPage.lectureName}</h3>
            <input
              type="search"
              className="p-news-kw"
              placeholder={t.surveyPage.keywordPlaceholder}
              maxLength={40}
              autoComplete="off"
              value={kogiKw}
              onChange={(e) => setKogiKw(e.target.value)}
            />
          </div>

          <div className="p-news-mat">
            <h3>{t.surveyPage.teacher}</h3>
            <input
              type="search"
              className="p-news-kw"
              placeholder={t.surveyPage.keywordPlaceholder}
              maxLength={40}
              autoComplete="off"
              value={kyoinKw}
              onChange={(e) => setKyoinKw(e.target.value)}
            />
          </div>

          <div className="p-news-clear">
            <button
              type="button"
              className="p-news-clear-btn"
              onClick={() => {
                setOnlyUnanswered(true);
                setKogiKw('');
                setKyoinKw('');
              }}
            >
              {t.newsPage.clear}
            </button>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
