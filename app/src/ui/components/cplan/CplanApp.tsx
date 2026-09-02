import { useCallback, useMemo, useState, type FormEvent } from 'react';
import type {
  CplanAttendanceSnapshot,
  CplanLink,
  CplanSnapshot,
} from '../../../domain/cplan/types';
import { sanitizeHostHtml } from '../../../lib/dom';

const normalizeText = (value: string | null | undefined) =>
  value?.replace(/\s+/g, ' ').trim() ?? '';

const CPLAN_LOGO_SRC = '/gakusei/web/Images/CustomImage/logo_kcg.png';

function activateNativeLink(link: CplanLink): void {
  const rawHref = link.element.getAttribute('href') ?? '';
  const rawOnClick = link.element.getAttribute('onclick') ?? '';
  const script = `${rawHref}\n${rawOnClick}`;
  const postBack =
    script.match(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/i) ??
    script.match(/WebForm_PostBackOptions\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/i);

  if (postBack) {
    submitAspNetPostBack(link.element, postBack[1], postBack[2]);
    return;
  }

  if (rawHref && rawHref !== '#' && !rawHref.toLowerCase().startsWith('javascript:')) {
    location.assign(link.element.href);
    return;
  }

  link.element.click();
}

function submitAspNetPostBack(
  element: HTMLElement,
  eventTarget: string,
  eventArgument: string,
): void {
  const form = element.closest('form') ?? document.querySelector<HTMLFormElement>('form');
  if (!form) return;

  const setHiddenValue = (name: string, value: string) => {
    let input: HTMLInputElement | null = null;
    const existing = form.elements.namedItem(name);
    if (existing instanceof HTMLInputElement) {
      input = existing;
    }
    if (!(input instanceof HTMLInputElement)) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      form.appendChild(input);
    }
    input.value = value;
  };

  setHiddenValue('__EVENTTARGET', eventTarget);
  setHiddenValue('__EVENTARGUMENT', eventArgument);
  HTMLFormElement.prototype.submit.call(form);
}

function CplanLogo() {
  const [src, setSrc] = useState(CPLAN_LOGO_SRC);
  const [ready, setReady] = useState(false);

  const processLogo = useCallback(
    (image: HTMLImageElement) => {
      if (src !== CPLAN_LOGO_SRC) {
        setReady(true);
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Canvas is unavailable');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const dark = [23, 23, 23] as const;
        for (let index = 0; index < pixels.data.length; index += 4) {
          const red = pixels.data[index];
          const green = pixels.data[index + 1];
          const blue = pixels.data[index + 2];
          // The source logo is magenta composited onto white. Its green channel
          // represents how much of that white background remains at each edge pixel.
          const whiteMix = green / 255;
          pixels.data[index] = Math.max(0, Math.round(red - whiteMix * (255 - dark[0])));
          pixels.data[index + 1] = Math.max(0, Math.round(green - whiteMix * (255 - dark[1])));
          pixels.data[index + 2] = Math.max(0, Math.round(blue - whiteMix * (255 - dark[2])));
        }
        context.putImageData(pixels, 0, 0);
        setSrc(canvas.toDataURL('image/png'));
      } catch {
        setReady(true);
      }
    },
    [src],
  );

  return (
    <img
      className={ready ? '' : 'p-cplan-logo-processing'}
      src={src}
      alt="KCG"
      onLoad={(event) => processLogo(event.currentTarget)}
    />
  );
}

function CplanIcon({ label, large = false }: { label: string; large?: boolean }) {
  const normalized = label.toLowerCase();
  const className = `p-cplan-icon${large ? ' p-cplan-icon--large' : ''}`;
  if (normalized === 'home')
    return (
      <span className={className} aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </span>
    );
  if (normalized.includes('時間割') || normalized.includes('timetable'))
    return (
      <span className={className} aria-hidden>
        <svg viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </span>
    );
  if (normalized.includes('就職') || normalized.includes('employment'))
    return (
      <span className={className} aria-hidden>
        <svg viewBox="0 0 24 24">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      </span>
    );
  if (normalized.includes('出欠') || normalized.includes('attendance'))
    return (
      <span className={className} aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <polyline points="17 11 19 13 23 9" />
        </svg>
      </span>
    );
  if (normalized.includes('シラバス') || normalized.includes('syllabus'))
    return (
      <span className={className} aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      </span>
    );
  if (normalized.includes('カルテ') || normalized.includes('chart'))
    return (
      <span className={className} aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </span>
    );
  if (
    normalized.includes('申請') ||
    normalized.includes('apply') ||
    normalized.includes('application')
  )
    return (
      <span className={className} aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      </span>
    );
  if (
    normalized.includes('企業') ||
    normalized.includes('enterprise') ||
    normalized.includes('seminar')
  )
    return (
      <span className={className} aria-hidden>
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
    );
  return (
    <span className={className} aria-hidden>
      <svg viewBox="0 0 24 24">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    </span>
  );
}

function CplanHeader({ snapshot }: { snapshot: CplanSnapshot }) {
  const text =
    snapshot.culture === 'ja'
      ? { product: 'キャンパスプラン Web', language: 'English', logout: 'ログアウト' }
      : { product: 'Campus Plan Web', language: '日本語', logout: 'Logout' };

  const changeLanguage = useCallback(() => {
    const url = new URL(location.href);
    url.searchParams.set('culture', snapshot.culture === 'ja' ? 'en' : 'ja');
    location.assign(url.href);
  }, [snapshot.culture]);

  const logout = useCallback(() => {
    const native =
      document.getElementById('hdrMenu_lbtnLogout') ??
      document.getElementById('ucMainHeader_hdrMenuV2_lbtnLogout');
    if (native instanceof HTMLAnchorElement) {
      activateNativeLink({ label: normalizeText(native.textContent), element: native });
      return;
    }
    if (native instanceof HTMLElement) {
      native.click();
      return;
    }
    location.assign('LoginForm.aspx');
  }, []);

  return (
    <header className="p-cplan-header">
      <div className="p-cplan-header-inner">
        <a className="p-cplan-brand" href="/gakusei/web/CplanMenuWeb/UI/MainMenuV2.aspx">
          <CplanLogo />
          <span>{text.product}</span>
        </a>
        <div className="p-cplan-header-actions">
          {snapshot.userName ? <span className="p-cplan-user">{snapshot.userName}</span> : null}
          <button type="button" className="p-cplan-secondary" onClick={changeLanguage}>
            <svg aria-hidden viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>{text.language}</span>
          </button>
          <button type="button" className="p-cplan-logout" onClick={logout}>
            <svg aria-hidden viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>{text.logout}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function CplanAttendance({ snapshot }: { snapshot: CplanSnapshot }) {
  const attendance = snapshot.attendance;
  const ja = snapshot.culture === 'ja';
  const [course, setCourse] = useState(attendance?.selectedCourse ?? '');
  const [password, setPassword] = useState(attendance?.passwordValue ?? '');
  if (!attendance) return null;

  const changeCourse = (value: string) => {
    setCourse(value);
    const native = document.getElementById('ddlRishuKogiList');
    if (!(native instanceof HTMLSelectElement)) return;
    native.value = value;
    submitAspNetPostBack(native, native.name || 'ddlRishuKogiList', '');
  };

  const submitAttendance = (event: FormEvent) => {
    event.preventDefault();
    const nativePassword = document.getElementById('txtOnetimePass');
    const nativeSubmit = document.getElementById('btnUpdate');
    if (
      !(nativePassword instanceof HTMLInputElement) ||
      (!(nativeSubmit instanceof HTMLInputElement) && !(nativeSubmit instanceof HTMLButtonElement))
    )
      return;
    nativePassword.value = password;
    nativeSubmit.click();
  };

  const resultRegistered =
    attendance.result && !/^(?:未登録|not registered)$/i.test(attendance.result);
  return (
    <>
      <CplanHeader snapshot={snapshot} />
      <main className="p-cplan-main p-cplan-attendance">
        <nav className="p-cplan-breadcrumb">
          <a href="/gakusei/web/CplanMenuWeb/UI/MainMenuV2.aspx">{ja ? 'ホーム' : 'Home'}</a>
          <span>›</span>
          <span>{snapshot.title || (ja ? '学生出欠登録' : 'Student attendance')}</span>
        </nav>
        <div className="p-cplan-page-head">
          <CplanIcon label="出欠" large />
          <div>
            <h1>{snapshot.title || (ja ? '学生出欠登録' : 'Student attendance')}</h1>
          </div>
        </div>
        <form className="p-cplan-attendance-card" onSubmit={submitAttendance}>
          {attendance.success ? (
            <p className="p-cplan-attendance-success" role="status">
              {attendance.success}
            </p>
          ) : null}
          <label className="p-cplan-field">
            <span>{ja ? '講義' : 'Course'}</span>
            <select
              value={course}
              disabled={attendance.courses.length === 0}
              onChange={(event) => changeCourse(event.target.value)}
            >
              {attendance.courses.map((item) => (
                <option value={item.value} key={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <dl className="p-cplan-attendance-details">
            <div>
              <dt>{ja ? '日付' : 'Date'}</dt>
              <dd>{attendance.date || '-'}</dd>
            </div>
            <div>
              <dt>{ja ? '時限' : 'Period'}</dt>
              <dd>{attendance.period || '-'}</dd>
            </div>
            <div>
              <dt>{ja ? '教員' : 'Instructor'}</dt>
              <dd>{attendance.teacher || '-'}</dd>
            </div>
            <div>
              <dt>{ja ? '登録結果' : 'Registration status'}</dt>
              <dd className={resultRegistered ? 'is-registered' : ''}>
                {attendance.result || '-'}
              </dd>
            </div>
          </dl>
          {attendance.error ? (
            <p className="p-cplan-attendance-error" role="alert">
              {attendance.error}
            </p>
          ) : null}
          {attendance.canSubmit ? (
            <>
              <label className="p-cplan-field">
                <span>{ja ? 'ワンタイムパスワード' : 'One-time password'}</span>
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={attendance.passwordMaxLength}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {attendance.message ? (
                <p className="p-cplan-attendance-help">{attendance.message}</p>
              ) : null}
              <button className="p-cplan-submit" type="submit" disabled={!password.trim()}>
                {ja ? '出席登録' : 'Register attendance'}
              </button>
            </>
          ) : null}
        </form>
      </main>
    </>
  );
}

function CplanLogin({ snapshot }: { snapshot: CplanSnapshot }) {
  const ja = snapshot.culture === 'ja';
  const [userId, setUserId] = useState(
    () => (document.getElementById('txtUserID') as HTMLInputElement | null)?.value ?? '',
  );
  const [password, setPassword] = useState('');

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const nativeUser = document.getElementById('txtUserID') as HTMLInputElement | null;
      const nativePassword = document.getElementById('txtPassword') as HTMLInputElement | null;
      if (nativeUser) nativeUser.value = userId;
      if (nativePassword) nativePassword.value = password;
      (document.getElementById('btnLogin2') as HTMLElement | null)?.click();
    },
    [password, userId],
  );

  const changeLanguage = useCallback(() => {
    const url = new URL(location.href);
    url.searchParams.set('culture', ja ? 'en' : 'ja');
    location.assign(url.href);
  }, [ja]);

  return (
    <div className="p-cplan-login-screen">
      <div className="p-cplan-login-brand">
        <CplanLogo />
        <span>{ja ? 'キャンパスプラン Web' : 'Campus Plan Web'}</span>
      </div>
      <form className="p-cplan-login-card" onSubmit={submit}>
        <h1>{ja ? 'ログイン' : 'Login'}</h1>
        <p>{ja ? 'アカウント情報を入力してください' : 'Enter your account information'}</p>
        <label>
          <span>{ja ? 'ユーザーID' : 'User ID'}</span>
          <input
            autoComplete="username"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          />
        </label>
        <label>
          <span>{ja ? 'パスワード' : 'Password'}</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="p-cplan-submit" type="submit">
          {ja ? 'ログイン' : 'Login'}
        </button>
        <button className="p-cplan-language-link" type="button" onClick={changeLanguage}>
          {ja ? 'English' : '日本語'}
        </button>
      </form>
    </div>
  );
}

function CplanMain({ snapshot }: { snapshot: CplanSnapshot }) {
  const ja = snapshot.culture === 'ja';
  return (
    <>
      <CplanHeader snapshot={snapshot} />
      <main className="p-cplan-main">
        <nav className="p-cplan-breadcrumb">
          <span>{ja ? 'ホーム' : 'Home'}</span>
        </nav>
        <div className="p-cplan-page-head">
          <CplanIcon label="home" large />
          <div>
            <h1>{ja ? 'ホーム' : 'Home'}</h1>
          </div>
        </div>
        <div className="p-cplan-grid">
          {snapshot.links.map((link, index) => (
            <button
              type="button"
              className="p-cplan-service"
              onClick={() => activateNativeLink(link)}
              key={`${link.label}-${index}`}
            >
              <CplanIcon label={link.label} />
              <span className="p-cplan-item-copy">
                <span>{link.label}</span>
              </span>
            </button>
          ))}
        </div>
        {snapshot.announcementHtml ? (
          <section className="p-cplan-notice">
            <h2>{ja ? 'お知らせ' : 'Announcements'}</h2>
            <div
              dangerouslySetInnerHTML={{ __html: sanitizeHostHtml(snapshot.announcementHtml) }}
            />
          </section>
        ) : null}
      </main>
    </>
  );
}

function CplanCategory({ snapshot }: { snapshot: CplanSnapshot }) {
  const ja = snapshot.culture === 'ja';
  const title = snapshot.title || (ja ? 'メニュー' : 'Menu');
  return (
    <>
      <CplanHeader snapshot={snapshot} />
      <main className="p-cplan-main">
        <nav className="p-cplan-breadcrumb">
          <a href="MainMenuV2.aspx">{ja ? 'ホーム' : 'Home'}</a>
          <span>›</span>
          <span>{title}</span>
        </nav>
        <div className="p-cplan-page-head">
          <CplanIcon label={title} large />
          <div>
            <span>{ja ? 'カテゴリ' : 'Category'}</span>
            <h1>{title}</h1>
          </div>
        </div>
        <div className="p-cplan-list">
          {snapshot.links.map((link, index) => (
            <button
              type="button"
              className="p-cplan-list-item"
              onClick={() => activateNativeLink(link)}
              key={`${link.label}-${index}`}
            >
              <CplanIcon label={link.label} />
              <span className="p-cplan-item-copy">
                <strong>{link.label}</strong>
                {link.description ? <small>{link.description}</small> : null}
              </span>
              <b aria-hidden>›</b>
            </button>
          ))}
        </div>
        <a className="p-cplan-back" href="MainMenuV2.aspx">
          <svg aria-hidden viewBox="0 0 24 24">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>{ja ? '戻る' : 'Back'}</span>
        </a>
      </main>
    </>
  );
}

export function CplanApp({ snapshot }: { snapshot: CplanSnapshot }) {
  const content = useMemo(() => {
    if (snapshot.route === 'login') return <CplanLogin snapshot={snapshot} />;
    if (snapshot.route === 'category') return <CplanCategory snapshot={snapshot} />;
    if (snapshot.route === 'attendance') return <CplanAttendance snapshot={snapshot} />;
    return <CplanMain snapshot={snapshot} />;
  }, [snapshot]);
  return content;
}
