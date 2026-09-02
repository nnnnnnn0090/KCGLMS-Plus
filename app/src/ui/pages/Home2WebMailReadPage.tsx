/** Home2 Web メールの本文表示（readmail）です。 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  formatHome2MailDateForDisplay,
  home2MailDateTimeIso,
} from '../../lib/format-home2-mail-date';
import { useI18n } from '../../i18n';

interface Home2ReadSnap {
  subject: string;
  from: string;
  date: string;
  body: string;
  nav: {
    reply: boolean;
    replyQuote: boolean;
    forward: boolean;
    binSave: boolean;
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

function parseReadmailFromDom(): Home2ReadSnap {
  const subEl = document.getElementById('MainContent_txtSub');
  const frmEl = document.getElementById('MainContent_txtForm');
  const bodyEl = document.getElementById('MainContent_txtBody');
  const dateCell = document.getElementById('MainContent_TableCell3');

  const subject = subEl instanceof HTMLInputElement ? subEl.value.replace(/\s+/g, ' ').trim() : '';
  const from = frmEl instanceof HTMLInputElement ? frmEl.value.replace(/\s+/g, ' ').trim() : '';
  const date = dateCell?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const body = bodyEl instanceof HTMLTextAreaElement ? bodyEl.value : '';

  return {
    subject,
    from,
    date,
    body,
    nav: {
      reply: navBtnDisabled('MainContent_butRetMail1'),
      replyQuote: navBtnDisabled('MainContent_butRetMail2'),
      forward: navBtnDisabled('MainContent_butFow'),
      binSave: navBtnDisabled('MainContent_butBinFileSave'),
    },
  };
}

function hrefFromBracketUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

function renderReadmailBodyWithBracketLinks(body: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  const re = /\[(https?:\/\/[^\]\s]+)\]/g;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    const raw = m[1];
    const href = hrefFromBracketUrl(raw);
    if (href) {
      parts.push(
        <a
          key={`readmail-bracket-${i++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="p-home2-mail-read-link"
        >
          {raw}
        </a>,
      );
    } else {
      parts.push(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts.length ? parts : body;
}

function IconBack() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Home2WebMailReadPage() {
  const { language, t } = useI18n();
  const [snap, setSnap] = useState<Home2ReadSnap>(() => parseReadmailFromDom());

  const bodyContent = useMemo(() => renderReadmailBodyWithBracketLinks(snap.body), [snap.body]);

  const refresh = useCallback(() => {
    setSnap(parseReadmailFromDom());
  }, []);

  const onBack = useCallback(() => {
    window.history.back();
  }, []);

  useEffect(() => {
    refresh();
    const mo = new MutationObserver(() => {
      refresh();
    });
    const root =
      document.getElementById('ctl01') ?? document.querySelector('.page .main') ?? document.body;
    mo.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    return () => mo.disconnect();
  }, [refresh]);

  return (
    <main className="p-main p-home2-send" id="p-home2-mail-read">
      <div className="p-home2-send-toolbar" role="toolbar" aria-label={t.home2.readToolbar}>
        <button
          type="button"
          className="p-home2-send-back"
          onClick={onBack}
          title={t.home2.backTitle}
        >
          <IconBack />
          <span>{t.common.back}</span>
        </button>
        <div className="p-home2-send-tools">
          <button
            type="button"
            className="p-home2-send-act p-home2-send-act--primary"
            disabled={snap.nav.reply}
            onClick={() => nativeSubmitClick('MainContent_butRetMail1')}
          >
            {t.home2.reply}
          </button>
          <button
            type="button"
            className="p-home2-send-act"
            disabled={snap.nav.replyQuote}
            onClick={() => nativeSubmitClick('MainContent_butRetMail2')}
          >
            {t.home2.replyQuote}
          </button>
          <button
            type="button"
            className="p-home2-send-act"
            disabled={snap.nav.forward}
            onClick={() => nativeSubmitClick('MainContent_butFow')}
          >
            {t.home2.forward}
          </button>
          <button
            type="button"
            className="p-home2-send-act p-home2-send-act--muted"
            disabled={snap.nav.binSave}
            onClick={() => nativeSubmitClick('MainContent_butBinFileSave')}
          >
            {t.home2.saveAttachments}
          </button>
        </div>
      </div>

      <article className="p-home2-send-card">
        <header className="p-home2-send-head">
          <h1 className="p-home2-send-title">{snap.subject || t.common.untitled}</h1>
        </header>

        <div className="p-home2-send-fields">
          <div className="p-home2-send-row">
            <span className="p-home2-send-rowk">{t.home2.sender}</span>
            <div className="p-home2-mail-read-field" title={snap.from || undefined}>
              {snap.from || '—'}
            </div>
          </div>
          {snap.date ? (
            <div className="p-home2-send-row">
              <span className="p-home2-send-rowk">{t.home2.date}</span>
              <time
                className="p-home2-mail-read-field"
                dateTime={home2MailDateTimeIso(snap.date)}
                title={snap.date}
              >
                {formatHome2MailDateForDisplay(snap.date, language)}
              </time>
            </div>
          ) : null}
        </div>

        <div className="p-home2-send-body p-home2-mail-read-body">{bodyContent}</div>
      </article>
    </main>
  );
}
