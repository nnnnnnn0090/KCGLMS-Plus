/**
 * Home2 Web メールルート判定（F-034〜F-039）。
 */

import { HOME2_HOSTNAME } from '../../contract/origins';

export type Home2MailLayout = 'full' | 'mailHead' | 'readMail' | 'sendMail' | 'headerOnly';

export interface Home2MailRoute {
  kind: 'home2-mail';
  layout: Home2MailLayout;
}

export function isHome2MailRoute(r: unknown): r is Home2MailRoute {
  return typeof r === 'object' && r !== null && (r as Home2MailRoute).kind === 'home2-mail';
}

function pathEndsWithDefaultAspx(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return /\/mail\/default\.aspx$/i.test(p);
}

function pathEndsWithMailheadAspx(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return /\/mail\/mailhead\.aspx$/i.test(p);
}

function pathEndsWithReadmailAspx(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return /\/mail\/readmail\.aspx$/i.test(p);
}

function pathEndsWithSendmailAspx(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return /\/mail\/sendmail\.aspx$/i.test(p);
}

export function matchHome2MailRoute(): Home2MailRoute | null {
  if (location.hostname !== HOME2_HOSTNAME) return null;
  const path = (location.pathname || '/').replace(/\/+$/, '') || '/';
  const pathLower = path.toLowerCase();
  if (pathLower !== '/mail' && !pathLower.startsWith('/mail/')) return null;
  if (pathLower === '/mail' || pathEndsWithDefaultAspx(path)) {
    return { kind: 'home2-mail', layout: 'full' };
  }
  if (pathEndsWithMailheadAspx(path)) {
    return { kind: 'home2-mail', layout: 'mailHead' };
  }
  if (pathEndsWithReadmailAspx(path)) {
    return { kind: 'home2-mail', layout: 'readMail' };
  }
  if (pathEndsWithSendmailAspx(path)) {
    return { kind: 'home2-mail', layout: 'sendMail' };
  }
  return { kind: 'home2-mail', layout: 'headerOnly' };
}

/** Cplan 対象ページ名（大文字小文字不問） */
export const CPLAN_TARGET_PAGES = [
  'loginform.aspx',
  'mainmenu.aspx',
  'mainmenuv2.aspx',
  'category.aspx',
  'categoryv2.aspx',
  'wsk_gakuseishukketsushinsei.aspx',
] as const;

export function isCplanTargetPage(pathname?: string): boolean {
  const page = (pathname ?? location.pathname).split('/').pop()?.toLowerCase() ?? '';
  return (CPLAN_TARGET_PAGES as readonly string[]).includes(page);
}
