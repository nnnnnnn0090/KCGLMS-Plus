/** Home2 Web メールのログイン（Default.aspx）です。 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { HOME2_MAIL_DEFAULT_URL, HOME2_ORIGIN } from '../../shared/constants';
import { useI18n } from '../../i18n';

const ID_USER = 'MainContent_txtUserID';
const ID_PASS = 'MainContent_txtPasswd';
const ID_CHK = 'MainContent_chkShowLastPage';
const ID_BTN = 'MainContent_butLogin';

function getNative<T extends HTMLElement>(id: string): T | null {
  const el = document.getElementById(id);
  return el instanceof HTMLElement ? (el as T) : null;
}

function setNativeValue(el: HTMLInputElement, value: string): void {
  const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  proto?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function readUser(): string {
  return getNative<HTMLInputElement>(ID_USER)?.value ?? '';
}

function readPass(): string {
  return getNative<HTMLInputElement>(ID_PASS)?.value ?? '';
}

function forceNativeShowLastPageOn(): void {
  const c = getNative<HTMLInputElement>(ID_CHK);
  if (!c || c.checked) return;
  c.checked = true;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  c.dispatchEvent(new Event('change', { bubbles: true }));
}

export function Home2WebMailLoginPage() {
  const { t } = useI18n();
  const [userId, setUserId] = useState('');
  const [passwd, setPasswd] = useState('');
  const nativeReadyRef = useRef(false);

  // 初回: ネイティブ（サーバ返却値・オートフィル）→ state
  useEffect(() => {
    const u = getNative<HTMLInputElement>(ID_USER);
    const p = getNative<HTMLInputElement>(ID_PASS);
    if (!u || !p) return;
    setUserId(u.value);
    setPasswd(p.value);
    forceNativeShowLastPageOn();
    nativeReadyRef.current = true;
  }, []);

  // state → ネイティブ
  useEffect(() => {
    if (!nativeReadyRef.current) return;
    const u = getNative<HTMLInputElement>(ID_USER);
    const p = getNative<HTMLInputElement>(ID_PASS);
    if (u && u.value !== userId) setNativeValue(u, userId);
    if (p && p.value !== passwd) setNativeValue(p, passwd);
    forceNativeShowLastPageOn();
  }, [userId, passwd]);

  // ネイティブの変更（オートフィル等）→ state
  useEffect(() => {
    const u = getNative<HTMLInputElement>(ID_USER);
    const p = getNative<HTMLInputElement>(ID_PASS);
    if (!u || !p) return;

    function pull() {
      setUserId(readUser());
      setPasswd(readPass());
      forceNativeShowLastPageOn();
    }

    u.addEventListener('input', pull);
    p.addEventListener('input', pull);
    return () => {
      u.removeEventListener('input', pull);
      p.removeEventListener('input', pull);
    };
  }, []);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const u = getNative<HTMLInputElement>(ID_USER);
      const p = getNative<HTMLInputElement>(ID_PASS);
      const c = getNative<HTMLInputElement>(ID_CHK);
      const btn = getNative<HTMLInputElement>(ID_BTN);
      if (!u || !p || !btn) return;
      setNativeValue(u, userId);
      setNativeValue(p, passwd);
      if (c) {
        c.checked = true;
        c.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof (btn as HTMLInputElement & { click: () => void }).click === 'function') {
        btn.click();
      }
    },
    [userId, passwd],
  );

  return (
    <main className="p-main p-home2-mail-login-screen" id="p-home2-mail-login">
      <div className="p-home2-mail-login-backdrop" aria-hidden />
      <div className="p-home2-mail-login-card">
        <header className="p-home2-mail-login-card-head">
          <a
            className="p-home2-mail-login-mark"
            href={HOME2_MAIL_DEFAULT_URL}
            title={t.home2.loginTopTitle}
          >
            <img src={`${HOME2_ORIGIN}/ic.bmp`} width={44} height={44} alt="" />
          </a>
          <div className="p-home2-mail-login-brand-text">
            <h1 className="p-home2-mail-login-title">KCG WebMail</h1>
            <p className="p-home2-mail-login-lead">{t.home2.loginLead}</p>
          </div>
        </header>

        <form className="p-home2-mail-form" onSubmit={onSubmit}>
          <label className="p-home2-mail-field">
            <span className="p-home2-mail-label">{t.home2.userId}</span>
            <input
              className="p-home2-mail-input"
              type="text"
              name="home2-user"
              autoComplete="username"
              inputMode="text"
              spellCheck={false}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </label>
          <label className="p-home2-mail-field">
            <span className="p-home2-mail-label">{t.home2.password}</span>
            <input
              className="p-home2-mail-input"
              type="password"
              name="home2-pass"
              autoComplete="current-password"
              value={passwd}
              onChange={(e) => setPasswd(e.target.value)}
            />
          </label>
          <div className="p-home2-mail-actions">
            <button type="submit" className="p-home2-mail-submit">
              {t.home2.login}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
