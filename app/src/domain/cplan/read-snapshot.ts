/** Cplan スナップショット読取（F-040）。ホスト DOM から現在ページ状態を抽出する。 */

import type { CplanAttendanceSnapshot, CplanLink, CplanRoute, CplanSnapshot } from './types';

export type { CplanSnapshot, CplanLink, CplanRoute, CplanAttendanceSnapshot };

const normalizeText = (value: string | null | undefined) =>
  value?.replace(/\s+/g, ' ').trim() ?? '';

const ENGLISH_CPLAN_TEXT = /\b(?:campus plan|login|logout|password|user id)\b/i;
const JAPANESE_CPLAN_TEXT =
  /(?:ホーム|ログイン|ログアウト|パスワード|ユーザーID|申請|出欠|学生|就職|時間割|シラバス|カルテ|セミナー|企業)/;
const ASCII_MENU_LABEL = /^[\x20-\x7e]+$/;

function detectRoute(): CplanRoute | null {
  const page = location.pathname.split('/').pop()?.toLowerCase() ?? '';
  if (page === 'loginform.aspx') return 'login';
  if (page === 'mainmenu.aspx' || page === 'mainmenuv2.aspx') return 'main';
  if (page === 'category.aspx' || page === 'categoryv2.aspx') return 'category';
  if (page === 'wsk_gakuseishukketsushinsei.aspx') return 'attendance';
  return null;
}

function readAttendance(): CplanAttendanceSnapshot | null {
  const courseSelect = document.getElementById('ddlRishuKogiList');
  const password = document.getElementById('txtOnetimePass');
  const submit = document.getElementById('btnUpdate');
  if (!(courseSelect instanceof HTMLSelectElement)) return null;

  const seenCourseValues = new Set<string>();
  const courses = Array.from(courseSelect.options)
    .map((option) => ({
      value: option.value,
      label: normalizeText(option.textContent),
    }))
    .filter((course) => {
      if (!course.value || !course.label || seenCourseValues.has(course.value)) return false;
      seenCourseValues.add(course.value);
      return true;
    });

  const errors = [
    document.getElementById('ucMainHeader_lblErrorMessage')?.textContent,
    document.getElementById('lblPasswordErrmessge')?.textContent,
  ]
    .map(normalizeText)
    .filter(Boolean);
  const error = [...new Set(errors)].join(' ');

  return {
    courses,
    selectedCourse: courseSelect.value,
    date: normalizeText(document.getElementById('lblKaikoYMD')?.textContent),
    period: normalizeText(document.getElementById('lblJigenNm')?.textContent),
    teacher: normalizeText(document.getElementById('lblKyoinNm')?.textContent),
    result: normalizeText(document.getElementById('lblShukketsuTimeStamp')?.textContent),
    error,
    success: normalizeText(document.getElementById('lblPasswordOkmessge')?.textContent),
    message: normalizeText(document.getElementById('lblOnetimeMessage')?.textContent),
    passwordValue: password instanceof HTMLInputElement ? password.value : '',
    passwordMaxLength:
      password instanceof HTMLInputElement && password.maxLength > 0 ? password.maxLength : 6,
    canSubmit:
      password instanceof HTMLInputElement &&
      (submit instanceof HTMLInputElement || submit instanceof HTMLButtonElement),
  };
}

function readMainLinks(): CplanLink[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('.menu li > a'))
    .map((element) => ({ label: normalizeText(element.textContent), element }))
    .filter((item) => item.label && (item.element.href || item.element.onclick));
}

function readCategoryLinks(): CplanLink[] {
  return Array.from(document.querySelectorAll<HTMLElement>('#menuTop dl')).flatMap((group) => {
    const element = group.querySelector<HTMLAnchorElement>('.parentRepeater > a');
    if (!element) return [];
    const label = normalizeText(element.textContent);
    if (!label || (!element.href && !element.onclick)) return [];
    return [
      {
        label,
        description: normalizeText(group.querySelector<HTMLElement>('dd span')?.textContent),
        element,
      },
    ];
  });
}

function detectCulture(route: CplanRoute, links: CplanLink[]): 'ja' | 'en' {
  const menuLabels = links.map((link) => link.label).filter(Boolean);
  if (menuLabels.length > 0) {
    return menuLabels.every((label) => ASCII_MENU_LABEL.test(label)) ? 'en' : 'ja';
  }

  const requested = new URL(location.href).searchParams.get('culture')?.toLowerCase();
  if (requested === 'ja' || requested === 'en') return requested;

  const documentLanguage = normalizeText(
    document.documentElement.lang || document.body?.lang,
  ).toLowerCase();
  if (documentLanguage === 'ja' || documentLanguage.startsWith('ja-')) return 'ja';
  if (documentLanguage === 'en' || documentLanguage.startsWith('en-')) return 'en';

  if (route === 'attendance') {
    const attendanceUiText = [
      document.getElementById('ucMainHeader_hdrMenuV2_lblTitle')?.textContent,
      document.getElementById('ucMainHeader_hdrMenuV2_lbtnLogout')?.textContent,
      document.getElementById('lblOnetimeMessage')?.textContent,
      (document.getElementById('btnUpdate') as HTMLInputElement | null)?.value,
    ]
      .map(normalizeText)
      .filter(Boolean)
      .join(' ');
    if (attendanceUiText && ASCII_MENU_LABEL.test(attendanceUiText)) return 'en';
    if (JAPANESE_CPLAN_TEXT.test(attendanceUiText)) return 'ja';
  }

  if (route === 'login') {
    const loginText = [
      document.querySelector('label[for="txtUserID"]')?.textContent,
      document.querySelector('label[for="txtPassword"]')?.textContent,
      document.getElementById('btnLogin2')?.textContent,
      document.querySelector('form')?.textContent,
    ]
      .map(normalizeText)
      .join(' ');
    if (ENGLISH_CPLAN_TEXT.test(loginText)) return 'en';
    if (JAPANESE_CPLAN_TEXT.test(loginText)) return 'ja';
  }

  return 'ja';
}

export function readCplanSnapshot(): CplanSnapshot | null {
  const route = detectRoute();
  if (!route) return null;
  const title = normalizeText(
    document.getElementById('hdrMenu_lblTitle')?.textContent ??
      document.getElementById('ucMainHeader_hdrMenuV2_lblTitle')?.textContent,
  );
  const links =
    route === 'main' ? readMainLinks() : route === 'category' ? readCategoryLinks() : [];
  const attendance = route === 'attendance' ? (readAttendance() ?? undefined) : undefined;
  if (route === 'main' && links.length === 0) return null;
  if (route === 'attendance' && !attendance) return null;
  return {
    route,
    culture: detectCulture(route, links),
    userName: normalizeText(
      document.getElementById('hdrMenu_lblUserName')?.textContent ??
        document.getElementById('ucMainHeader_hdrMenuV2_lblUserName')?.textContent,
    ),
    title,
    announcementHtml: document.getElementById('lblInfo')?.innerHTML ?? '',
    links,
    attendance,
  };
}
