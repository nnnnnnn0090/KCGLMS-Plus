/** Home2 Web メールの送信（sendmail）画面です。 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n';

interface Home2SendAttachment {
  value: string;
  label: string;
  selected: boolean;
}

interface Home2SendSnap {
  from: string;
  ccError: string;
  sendError: string;
  fileInfo: string;
  byteInfo: string;
  fileName: string;
  attachments: Home2SendAttachment[];
  ccVisible: boolean;
  nav: {
    showCc: boolean;
    send: boolean;
    fileAdd: boolean;
    fileDel: boolean;
  };
}

const ID_TO = 'MainContent_txtSendAdd';
const ID_SUB = 'MainContent_txtSub';
const ID_CC = 'MainContent_txtCC';
const ID_BODY = 'MainContent_txtBody';
const ID_SHOW_CC = 'MainContent_CheckBox1';
const ID_COPY_ME = 'MainContent_chkKakunin';
const ID_FILE = 'MainContent_FileUpload1';
const ID_LST = 'MainContent_lstAddFiles';

function getNative<T extends HTMLElement>(id: string): T | null {
  const el = document.getElementById(id);
  return el instanceof HTMLElement ? (el as T) : null;
}

function navBtnDisabled(id: string): boolean {
  const el = document.getElementById(id);
  return !(el instanceof HTMLInputElement) || el.disabled;
}

function nativeSubmitClick(id: string): void {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement) el.click();
}

function setNativeInputValue(el: HTMLInputElement, value: string): void {
  const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  proto?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setNativeTextareaValue(el: HTMLTextAreaElement, value: string): void {
  const proto = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  proto?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setNativeChecked(el: HTMLInputElement, checked: boolean): void {
  if (el.checked === checked) return;
  el.checked = checked;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function readAttachments(): Home2SendAttachment[] {
  const sel = getNative<HTMLSelectElement>(ID_LST);
  if (!sel) return [];
  return Array.from(sel.options).map((o) => ({
    value: o.value,
    label: o.textContent?.replace(/\s+/g, ' ').trim() ?? o.value,
    selected: o.selected,
  }));
}

/** WebForms の RegularExpressionValidator は文言を常に DOM に持ち、無効時は visibility:hidden 等になる */
function readVisibleValidatorMessage(id: string): string {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLElement)) return '';
  const cs = window.getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none') return '';
  return el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function parseSendmailFromDom(): Home2SendSnap {
  const ccInput = getNative<HTMLInputElement>(ID_CC);
  const file = getNative<HTMLInputElement>(ID_FILE);
  const showCc = getNative<HTMLInputElement>(ID_SHOW_CC);

  return {
    from:
      getNative<HTMLInputElement>('MainContent_txtMyAdd')?.value?.replace(/\s+/g, ' ').trim() ?? '',
    ccError: ccInput ? readVisibleValidatorMessage('MainContent_RegularExpressionValidator1') : '',
    sendError:
      document
        .getElementById('MainContent_labSendError')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? '',
    fileInfo:
      document
        .getElementById('MainContent_labAddFileInfo')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? '',
    byteInfo:
      document.getElementById('MainContent_labByte')?.textContent?.replace(/\s+/g, ' ').trim() ??
      '',
    fileName: file?.files?.[0]?.name ?? '',
    attachments: readAttachments(),
    ccVisible: !!ccInput || (showCc?.checked ?? false),
    nav: {
      showCc: navBtnDisabled(ID_SHOW_CC),
      send: navBtnDisabled('MainContent_butSend'),
      fileAdd: navBtnDisabled('MainContent_butFileAdd'),
      fileDel: navBtnDisabled('MainContent_butDelFile'),
    },
  };
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

function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 11l18-8-8 18-2-8-8-2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconAttach() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12.5l-8.5 8.5a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatFileSizeBytes(raw: string, locale: string): string {
  const m = String(raw).match(/(-?\d[\d,_\s]*)/);
  if (!m) return raw.replace(/\s+/g, ' ').trim();
  const n = Number.parseInt(m[1].replace(/[,_\s]/g, ''), 10);
  if (!Number.isFinite(n) || n < 0) return raw.replace(/\s+/g, ' ').trim();
  if (n < 1024) return `${n.toLocaleString(locale)} B`;
  const kb = n / 1024;
  if (kb < 1024) {
    const d = kb >= 100 ? 0 : kb >= 10 ? 1 : 2;
    return `${Number(kb.toFixed(d)).toLocaleString(locale, { maximumFractionDigits: d })} KB`;
  }
  const mb = n / (1024 * 1024);
  const d = mb >= 10 ? 1 : 2;
  return `${Number(mb.toFixed(d)).toLocaleString(locale, { maximumFractionDigits: d })} MB`;
}

export function Home2WebMailSendPage() {
  const { locale, t } = useI18n();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [cc, setCc] = useState('');
  const [body, setBody] = useState('');
  const [copyMe, setCopyMe] = useState(false);
  const [snap, setSnap] = useState<Home2SendSnap>(() => parseSendmailFromDom());
  const [selectedAttachment, setSelectedAttachment] = useState<string>('');
  const nativeReadyRef = useRef(false);

  const refresh = useCallback(() => {
    setSnap(parseSendmailFromDom());
  }, []);

  useEffect(() => {
    const toEl = getNative<HTMLInputElement>(ID_TO);
    const subEl = getNative<HTMLInputElement>(ID_SUB);
    const bodyEl = getNative<HTMLTextAreaElement>(ID_BODY);
    const ccEl = getNative<HTMLInputElement>(ID_CC);
    const copyEl = getNative<HTMLInputElement>(ID_COPY_ME);
    if (!toEl || !subEl || !bodyEl) return;
    setTo(toEl.value);
    setSubject(subEl.value);
    setBody(bodyEl.value);
    setCc(ccEl?.value ?? '');
    setCopyMe(copyEl?.checked ?? false);
    nativeReadyRef.current = true;
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!nativeReadyRef.current) return;
    const toEl = getNative<HTMLInputElement>(ID_TO);
    const subEl = getNative<HTMLInputElement>(ID_SUB);
    const bodyEl = getNative<HTMLTextAreaElement>(ID_BODY);
    const ccEl = getNative<HTMLInputElement>(ID_CC);
    const copyEl = getNative<HTMLInputElement>(ID_COPY_ME);
    if (toEl && toEl.value !== to) setNativeInputValue(toEl, to);
    if (subEl && subEl.value !== subject) setNativeInputValue(subEl, subject);
    if (bodyEl && bodyEl.value !== body) setNativeTextareaValue(bodyEl, body);
    if (ccEl && ccEl.value !== cc) setNativeInputValue(ccEl, cc);
    if (copyEl) setNativeChecked(copyEl, copyMe);
  }, [to, subject, cc, body, copyMe]);

  useEffect(() => {
    const root =
      document.getElementById('ctl01') ?? document.querySelector('.page .main') ?? document.body;
    const mo = new MutationObserver(() => {
      if (!nativeReadyRef.current) return;
      const ccEl = getNative<HTMLInputElement>(ID_CC);
      setCc(ccEl?.value ?? '');
      refresh();
    });
    mo.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    return () => mo.disconnect();
  }, [refresh]);

  /** ファイル選択後はネイティブの「ファイル追加」と同じ POST をそのまま走らせる（DOM 差し替えにも耐えるよう capture で委譲） */
  useEffect(() => {
    const onChangeCapture = (ev: Event) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement) || t.type !== 'file') return;
      if (t.id !== ID_FILE) return;
      if (!t.files?.length) return;
      if (navBtnDisabled('MainContent_butFileAdd')) return;
      queueMicrotask(() => nativeSubmitClick('MainContent_butFileAdd'));
    };
    document.addEventListener('change', onChangeCapture, true);
    return () => document.removeEventListener('change', onChangeCapture, true);
  }, []);

  useEffect(() => {
    if (!snap.attachments.length) {
      if (selectedAttachment !== '') setSelectedAttachment('');
      return;
    }
    const stillExists = snap.attachments.some((a) => a.value === selectedAttachment);
    if (!stillExists) setSelectedAttachment(snap.attachments[0].value);
  }, [snap.attachments, selectedAttachment]);

  const onPickAttachment = useCallback((value: string) => {
    setSelectedAttachment(value);
    const sel = getNative<HTMLSelectElement>(ID_LST);
    if (!sel) return;
    Array.from(sel.options).forEach((o) => {
      o.selected = o.value === value;
    });
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, []);

  const onPickFile = useCallback(() => {
    getNative<HTMLInputElement>(ID_FILE)?.click();
  }, []);

  const onFileDel = useCallback(() => {
    nativeSubmitClick('MainContent_butDelFile');
  }, []);

  const onToggleCc = useCallback(() => {
    nativeSubmitClick(ID_SHOW_CC);
  }, []);

  /** `butRetHead` は常に受信箱一覧へ飛ぶ。返信などで readmail から来た場合は一覧ではなく直前の画面に戻したいので履歴を使う */
  const onBack = useCallback(() => {
    window.history.back();
  }, []);

  const onSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const toEl = getNative<HTMLInputElement>(ID_TO);
      const subEl = getNative<HTMLInputElement>(ID_SUB);
      const bodyEl = getNative<HTMLTextAreaElement>(ID_BODY);
      const ccEl = getNative<HTMLInputElement>(ID_CC);
      const copyEl = getNative<HTMLInputElement>(ID_COPY_ME);
      if (toEl) setNativeInputValue(toEl, to);
      if (subEl) setNativeInputValue(subEl, subject);
      if (bodyEl) setNativeTextareaValue(bodyEl, body);
      if (ccEl) setNativeInputValue(ccEl, cc);
      if (copyEl) setNativeChecked(copyEl, copyMe);
      nativeSubmitClick('MainContent_butSend');
    },
    [to, subject, cc, body, copyMe],
  );

  const sizeLabel = useMemo(
    () => (snap.byteInfo ? formatFileSizeBytes(snap.byteInfo, locale) : ''),
    [snap.byteInfo, locale],
  );

  return (
    <main className="p-main p-home2-send" id="p-home2-mail-send">
      <div className="p-home2-send-toolbar" role="toolbar" aria-label={t.home2.sendToolbar}>
        <button type="button" className="p-home2-send-back" onClick={onBack}>
          <IconBack />
          <span>{t.common.back}</span>
        </button>
        <div className="p-home2-send-tools">
          <button
            type="button"
            className="p-home2-send-act p-home2-send-act--muted"
            onClick={onToggleCc}
            disabled={snap.nav.showCc}
          >
            {snap.ccVisible ? t.home2.hideCc : t.home2.showCc}
          </button>
          <button
            type="submit"
            form="p-home2-send-form"
            className="p-home2-send-act p-home2-send-act--primary"
            disabled={snap.nav.send}
          >
            <IconSend />
            <span>{t.home2.send}</span>
          </button>
        </div>
      </div>

      <form id="p-home2-send-form" className="p-home2-send-card" onSubmit={onSend}>
        <header className="p-home2-send-head">
          <h1 className="p-home2-send-title">{t.home2.newMessage}</h1>
          <p className="p-home2-send-from">
            {t.home2.from} <span>{snap.from || t.common.none}</span>
          </p>
        </header>

        <div className="p-home2-send-fields">
          <label className="p-home2-send-row">
            <span className="p-home2-send-rowk">{t.home2.to}</span>
            <input
              className="p-home2-send-rowv p-home2-send-rowv--tone"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              autoComplete="off"
            />
          </label>

          {snap.ccVisible ? (
            <label className="p-home2-send-row">
              <span className="p-home2-send-rowk">Cc</span>
              <input
                className="p-home2-send-rowv p-home2-send-rowv--tone"
                type="email"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="cc@example.com"
                autoComplete="off"
              />
            </label>
          ) : null}

          <label className="p-home2-send-row">
            <span className="p-home2-send-rowk">{t.home2.subject}</span>
            <input
              className="p-home2-send-rowv p-home2-send-rowv--tone"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t.home2.subjectPlaceholder}
            />
          </label>
        </div>

        <textarea
          className="p-home2-send-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t.home2.bodyPlaceholder}
          rows={14}
        />

        <section className="p-home2-send-attach" aria-label={t.home2.attachments}>
          <div className="p-home2-send-attach-row">
            <button
              type="button"
              className="p-home2-send-act"
              onClick={onPickFile}
              title={t.home2.pickFileTitle}
            >
              <IconAttach />
              <span>{t.home2.chooseFile}</span>
            </button>
            {snap.fileName ? (
              <span className="p-home2-send-file-name" title={snap.fileName}>
                {snap.fileName}
              </span>
            ) : null}
          </div>

          {snap.attachments.length > 0 ? (
            <ul
              className="p-home2-send-attach-list"
              role="listbox"
              aria-label={t.home2.attachedFiles}
            >
              {snap.attachments.map((a) => {
                const isSel = (selectedAttachment || snap.attachments[0]?.value) === a.value;
                return (
                  <li
                    key={a.value}
                    className={`p-home2-send-chip${isSel ? ' is-selected' : ''}`}
                    role="option"
                    aria-selected={isSel}
                  >
                    <button
                      type="button"
                      className="p-home2-send-chip-label"
                      onClick={() => onPickAttachment(a.value)}
                      title={a.label}
                    >
                      <IconAttach />
                      <span>{a.label}</span>
                    </button>
                    <button
                      type="button"
                      className="p-home2-send-chip-x"
                      aria-label={t.home2.removeAttachment(a.label)}
                      onClick={() => {
                        onPickAttachment(a.value);
                        onFileDel();
                      }}
                      disabled={snap.nav.fileDel && !isSel}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="p-home2-send-empty">{t.home2.noAttachments}</p>
          )}

          {sizeLabel ? <p className="p-home2-send-note">{t.home2.totalSize(sizeLabel)}</p> : null}
          {snap.fileInfo ? <p className="p-home2-send-note">{snap.fileInfo}</p> : null}
        </section>

        <label className="p-home2-send-copyme">
          <input type="checkbox" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} />
          <span>{t.home2.copyMe}</span>
        </label>

        {snap.ccError ? <p className="p-home2-send-error">{snap.ccError}</p> : null}
        {snap.sendError ? <p className="p-home2-send-error">{snap.sendError}</p> : null}
      </form>
    </main>
  );
}
