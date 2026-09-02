/** Home2 Web メールの受信一覧（mailhead）オーバーレイです。 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  formatHome2MailDateForDisplay,
  home2MailDateTimeIso,
  parseHome2MailDateMs,
} from '../../lib/format-home2-mail-date';
import { runMailheadPagerAsync } from '../../lib/home2-mailhead-async';
import { useI18n, type I18nMessages } from '../../i18n';

interface Home2MailboxRow {
  readBtnId: string;
  mailNum: string;
  displayRank: number | null;
  subject: string;
  from: string;
  date: string;
  size: string;
  chkId: string | null;
  checked: boolean;
  readDisabled: boolean;
}

interface Home2MailboxSnap {
  caption: string;
  inboxTotal: number | null;
  address: string;
  rows: Home2MailboxRow[];
  nav: {
    first1: boolean;
    prev1: boolean;
    next1: boolean;
    last1: boolean;
    newMail: boolean;
    first2: boolean;
    prev2: boolean;
    next2: boolean;
    last2: boolean;
    del: boolean;
    selAll: boolean;
  };
}

function navBtnDisabled(id: string): boolean {
  const el = document.getElementById(id);
  return !(el instanceof HTMLInputElement) || el.disabled;
}

function nativeSubmitClick(id: string): void {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement) el.click();
}

function setNativeCheckbox(chkId: string, checked: boolean): void {
  const el = document.getElementById(chkId);
  if (!(el instanceof HTMLInputElement)) return;
  el.checked = checked;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function parseInboxTotalFromCaption(raw: string): number | null {
  const m = raw
    .replace(/\s+/g, ' ')
    .trim()
    .match(/\(総数=(\d+)\)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

function formatInboxSizeLabel(raw: string, locale: string, t: I18nMessages): string {
  const n = Number.parseInt(String(raw).replace(/[,_\s]/g, ''), 10);
  if (!Number.isFinite(n) || n < 0) return raw.replace(/\s+/g, ' ').trim();
  if (n < 1024) return `${n.toLocaleString(locale)} ${t.home2.byteUnit}`;
  const kb = n / 1024;
  if (kb < 1024) {
    const digits = kb >= 100 ? 0 : kb >= 10 ? 1 : 2;
    const v = Number(kb.toFixed(digits));
    return `${v.toLocaleString(locale, { maximumFractionDigits: digits })} KB`;
  }
  const mb = n / (1024 * 1024);
  const md = mb >= 10 ? 1 : 2;
  const v = Number(mb.toFixed(md));
  return `${v.toLocaleString(locale, { maximumFractionDigits: md })} MB`;
}

/** 新着先頭表示向けに caption の通番レンジを書き換える */
function rewriteMailboxCaptionNewestFirstRank(
  raw: string,
  rows: Home2MailboxRow[],
  t: I18nMessages,
): string {
  const compact = raw.replace(/\s+/g, ' ').trim();
  const total = parseInboxTotalFromCaption(compact);
  if (total == null) return raw;
  const nums = rows.map((r) => parseInt(r.mailNum, 10)).filter((n) => Number.isFinite(n) && n >= 1);
  if (nums.length === 0 || rows.length === 0) return raw;
  const maxM = Math.max(...nums);
  const userLo = total - maxM;
  const userHi = userLo + rows.length - 1;
  return t.home2.mailboxCaption(userLo, userHi, total);
}

function sortMailboxRowsNewestFirst(rows: Home2MailboxRow[]): void {
  rows.sort((a, b) => {
    const ta = parseHome2MailDateMs(a.date);
    const tb = parseHome2MailDateMs(b.date);
    const aOk = Number.isFinite(ta);
    const bOk = Number.isFinite(tb);
    if (aOk && bOk && tb !== ta) return tb - ta;
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    const na = parseInt(a.mailNum, 10);
    const nb = parseInt(b.mailNum, 10);
    const aNum = Number.isFinite(na) ? na : -Infinity;
    const bNum = Number.isFinite(nb) ? nb : -Infinity;
    return bNum - aNum;
  });
}

function parseMailboxFromDom(t: I18nMessages): Home2MailboxSnap {
  const address =
    document.getElementById('MainContent_Label2')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const table = document.getElementById('MainContent_Table1');

  const emptyNav = {
    first1: true,
    prev1: true,
    next1: true,
    last1: true,
    newMail: true,
    first2: true,
    prev2: true,
    next2: true,
    last2: true,
    del: true,
    selAll: true,
  };

  if (!(table instanceof HTMLTableElement)) {
    return { caption: '', inboxTotal: null, address, rows: [], nav: emptyNav };
  }

  const captionRaw = table.querySelector('caption')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  const rows: Home2MailboxRow[] = [];
  for (const tr of table.querySelectorAll('tbody > tr')) {
    if (tr.querySelector('#MainContent_butSelAll')) continue;
    if (tr.querySelector('#MainContent_butFirst2')) continue;

    const readBtn = tr.querySelector<HTMLInputElement>('input[type="submit"][name*="butRead"]');
    if (!readBtn) continue;

    const tds = tr.querySelectorAll('td');
    if (tds.length < 5) continue;

    const subject = tds[1]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const from = tds[2]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const date = tds[3]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const size = tds[4]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    const num = readBtn.value.trim();
    const readDisabled = readBtn.disabled;
    if (!num && readDisabled && !subject) continue;

    const chk = tr.querySelector<HTMLInputElement>(
      'input[type="checkbox"][id^="MainContent_chkDel"]',
    );

    rows.push({
      readBtnId: readBtn.id,
      mailNum: num,
      displayRank: null,
      subject,
      from,
      date,
      size,
      chkId: chk?.id ?? null,
      checked: chk?.checked ?? false,
      readDisabled,
    });
  }

  sortMailboxRowsNewestFirst(rows);

  const caption = rewriteMailboxCaptionNewestFirstRank(captionRaw, rows, t);
  const inboxTotal = parseInboxTotalFromCaption(captionRaw);

  const nums = rows.map((r) => parseInt(r.mailNum, 10)).filter((n) => Number.isFinite(n) && n >= 1);
  const userLo = inboxTotal != null && nums.length > 0 ? inboxTotal - Math.max(...nums) : null;
  const rowsWithRank: Home2MailboxRow[] = rows.map((r, i) => ({
    ...r,
    displayRank: userLo != null ? userLo + i : null,
  }));

  return {
    caption,
    inboxTotal,
    address,
    rows: rowsWithRank,
    nav: {
      first1: navBtnDisabled('MainContent_butFirst1'),
      prev1: navBtnDisabled('MainContent_butPrev1'),
      next1: navBtnDisabled('MainContent_butNext1'),
      last1: navBtnDisabled('MainContent_butLast1'),
      newMail: navBtnDisabled('MainContent_butNewMail1'),
      first2: navBtnDisabled('MainContent_butFirst2'),
      prev2: navBtnDisabled('MainContent_butPrev2'),
      next2: navBtnDisabled('MainContent_butNext2'),
      last2: navBtnDisabled('MainContent_butLast2'),
      del: navBtnDisabled('MainContent_butDel'),
      selAll: navBtnDisabled('MainContent_butSelAll'),
    },
  };
}

function IconChevronLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconChevronsLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  );
}

function IconChevronsRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="13 17 18 12 13 7" />
      <polyline points="6 17 11 12 6 7" />
    </svg>
  );
}

function IconPen() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export function Home2WebMailMailboxPage() {
  const { language, locale, t } = useI18n();
  const [snap, setSnap] = useState<Home2MailboxSnap>(() => parseMailboxFromDom(t));
  /** 削除チェック・削除実行はこのモード中のみ表示 */
  const [deleteEditMode, setDeleteEditMode] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listErr, setListErr] = useState<string | null>(null);
  const pagerReqRef = useRef(0);

  const refresh = useCallback(() => {
    setSnap(parseMailboxFromDom(t));
  }, [t]);

  const onPager = useCallback(
    async (submitterId: string) => {
      const el = document.getElementById(submitterId);
      if (!(el instanceof HTMLInputElement) || el.disabled) return;
      const seq = ++pagerReqRef.current;
      setListErr(null);
      setListLoading(true);
      try {
        await runMailheadPagerAsync(submitterId);
        if (pagerReqRef.current !== seq) return;
        refresh();
      } catch {
        if (pagerReqRef.current !== seq) return;
        setListErr(t.home2.updateListFailed);
      } finally {
        if (pagerReqRef.current === seq) setListLoading(false);
      }
    },
    [refresh, t],
  );

  useEffect(() => {
    refresh();
  }, [language, refresh]);

  useEffect(() => {
    refresh();
    const mo = new MutationObserver(() => {
      refresh();
    });
    const root =
      document.querySelector('.page .main') ?? document.getElementById('ctl01') ?? document.body;
    mo.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    return () => mo.disconnect();
  }, [refresh]);

  const onChk = useCallback(
    (chkId: string | null, checked: boolean) => {
      if (!chkId) return;
      setNativeCheckbox(chkId, checked);
      refresh();
    },
    [refresh],
  );

  const onOpenRow = useCallback((row: Home2MailboxRow) => {
    if (row.readDisabled || !row.mailNum) return;
    nativeSubmitClick(row.readBtnId);
  }, []);

  return (
    <main
      className={`p-main p-home2-send p-home2-gm${deleteEditMode ? ' p-home2-gm--delete-edit' : ''}`}
      id="p-home2-mail-mailbox"
      aria-busy={listLoading}
    >
      <article className={`p-home2-send-card${listLoading ? ' p-home2-gm--list-loading' : ''}`}>
        <header className="p-home2-send-head">
          <h1 className="p-home2-send-title">{t.home2.inbox}</h1>
          {snap.address ? (
            <p className="p-home2-send-from">
              {t.home2.inboxAddress} <span title={snap.address}>{snap.address}</span>
            </p>
          ) : null}
        </header>

        {snap.caption ? (
          <p className="p-home2-send-note p-home2-gm-caption" role="status">
            {snap.caption}
          </p>
        ) : null}
        {listErr ? (
          <p className="p-home2-send-error" role="alert">
            {listErr}
          </p>
        ) : null}

        <div className="p-home2-send-toolbar" role="toolbar" aria-label={t.home2.mailListToolbar}>
          <div className="p-home2-gm-toolbar-start">
            <div className="p-home2-gm-seg" role="group" aria-label={t.home2.listPosition}>
              <button
                type="button"
                className="p-home2-gm-seg-btn"
                disabled={listLoading || snap.nav.last1}
                title={t.home2.firstNewerPage}
                onClick={() => void onPager('MainContent_butLast1')}
              >
                <IconChevronsLeft />
              </button>
              <button
                type="button"
                className="p-home2-gm-seg-btn"
                disabled={listLoading || snap.nav.next1}
                title={t.home2.newerPage}
                onClick={() => void onPager('MainContent_butNext1')}
              >
                <IconChevronLeft />
              </button>
              <button
                type="button"
                className="p-home2-gm-seg-btn"
                disabled={listLoading || snap.nav.prev1}
                title={t.home2.olderPage}
                onClick={() => void onPager('MainContent_butPrev1')}
              >
                <IconChevronRight />
              </button>
              <button
                type="button"
                className="p-home2-gm-seg-btn"
                disabled={listLoading || snap.nav.first1}
                title={t.home2.oldestPage}
                onClick={() => void onPager('MainContent_butFirst1')}
              >
                <IconChevronsRight />
              </button>
            </div>
            <button
              type="button"
              className="p-home2-send-act p-home2-send-act--primary"
              disabled={snap.nav.newMail}
              onClick={() => nativeSubmitClick('MainContent_butNewMail1')}
            >
              <IconPen />
              <span>{t.home2.compose}</span>
            </button>
          </div>
          <div className="p-home2-send-tools">
            {deleteEditMode ? (
              <button
                type="button"
                className="p-home2-send-act p-home2-send-act--muted"
                disabled={snap.nav.selAll}
                onClick={() => nativeSubmitClick('MainContent_butSelAll')}
              >
                {t.home2.selectAll}
              </button>
            ) : null}
            <button
              type="button"
              className={`p-home2-send-act p-home2-send-act--muted${deleteEditMode ? ' p-home2-gm-select-btn--on' : ''}`}
              aria-pressed={deleteEditMode}
              onClick={() => setDeleteEditMode((v) => !v)}
            >
              {deleteEditMode ? t.common.done : t.home2.select}
            </button>
          </div>
        </div>

        <div className="p-home2-gm-list-shell">
          {snap.rows.length === 0 ? (
            <div className="p-home2-gm-empty">{t.home2.emptyMailbox}</div>
          ) : (
            <div className="p-home2-gm-list" role="list">
              {snap.rows.map((row) => {
                const rowOpenable = Boolean(row.mailNum) && !row.readDisabled;
                return (
                  <div
                    key={row.readBtnId}
                    role="listitem"
                    className={`p-home2-gm-row${row.mailNum ? '' : ' p-home2-gm-row--muted'}${rowOpenable ? ' p-home2-gm-row--clickable' : ''}`}
                    onClick={() => {
                      if (!rowOpenable) return;
                      onOpenRow(row);
                    }}
                  >
                    {deleteEditMode ? (
                      <div
                        className="p-home2-gm-row-chk"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {row.chkId ? (
                          <input
                            type="checkbox"
                            checked={row.checked}
                            onChange={(e) => onChk(row.chkId, e.target.checked)}
                            aria-label={t.home2.markForDelete}
                          />
                        ) : null}
                      </div>
                    ) : null}
                    <div className="p-home2-gm-row-body">
                      <div className="p-home2-gm-row-top">
                        <span className="p-home2-gm-from" title={row.from}>
                          {row.from || '—'}
                        </span>
                        <time
                          className="p-home2-gm-date"
                          dateTime={home2MailDateTimeIso(row.date)}
                          title={row.date}
                        >
                          {formatHome2MailDateForDisplay(row.date, language)}
                        </time>
                      </div>
                      <span
                        className="p-home2-gm-subject"
                        aria-disabled={row.readDisabled || !row.mailNum}
                      >
                        {row.subject || t.common.untitled}
                      </span>
                      <div className="p-home2-gm-row-bottom">
                        {row.mailNum ? (
                          <span
                            className="p-home2-gm-meta-num"
                            title={
                              row.displayRank != null
                                ? t.home2.serverNumber(row.mailNum)
                                : undefined
                            }
                          >
                            #{row.displayRank != null ? String(row.displayRank) : row.mailNum}
                          </span>
                        ) : null}
                        <span
                          className="p-home2-gm-meta-size"
                          title={
                            row.size ? t.home2.bytesTitle(row.size.replace(/\s+/g, '')) : undefined
                          }
                        >
                          {row.size ? formatInboxSizeLabel(row.size, locale, t) : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className="p-home2-gm-footer">
          <div className="p-home2-gm-seg" role="group" aria-label={t.home2.pager}>
            <button
              type="button"
              className="p-home2-gm-seg-btn"
              disabled={listLoading || snap.nav.last2}
              title={t.home2.firstNewerPage}
              onClick={() => void onPager('MainContent_butLast2')}
            >
              <IconChevronsLeft />
            </button>
            <button
              type="button"
              className="p-home2-gm-seg-btn"
              disabled={listLoading || snap.nav.next2}
              title={t.home2.newerPage}
              onClick={() => void onPager('MainContent_butNext2')}
            >
              <IconChevronLeft />
            </button>
            <button
              type="button"
              className="p-home2-gm-seg-btn"
              disabled={listLoading || snap.nav.prev2}
              title={t.home2.olderPage}
              onClick={() => void onPager('MainContent_butPrev2')}
            >
              <IconChevronRight />
            </button>
            <button
              type="button"
              className="p-home2-gm-seg-btn"
              disabled={listLoading || snap.nav.first2}
              title={t.home2.oldestPage}
              onClick={() => void onPager('MainContent_butFirst2')}
            >
              <IconChevronsRight />
            </button>
          </div>
          {deleteEditMode ? (
            <>
              <span className="p-home2-gm-footer-spacer" aria-hidden />
              <button
                type="button"
                className="p-home2-send-act p-home2-gm-delete"
                disabled={snap.nav.del}
                onClick={() => nativeSubmitClick('MainContent_butDel')}
              >
                {t.home2.moveToTrash}
              </button>
            </>
          ) : null}
        </footer>
      </article>
    </main>
  );
}
