/**
 * King LMS ページ種別の判定（ログイン誘導・コース・カレンダー等）と、同期後のポータル URL へのハッシュ付与です。
 */

import { KING_LMS_HOSTNAME } from '../../shared/constants';
import { isKingLmsSamlLoginUrl } from '../../shared/king-lms-url';

export function isSamlLoginPage(): boolean {
  return isKingLmsSamlLoginUrl(location.href);
}

export function isLoginRedirectPage(): boolean {
  try {
    if (location.hostname !== KING_LMS_HOSTNAME) return false;
    const path = location.pathname ?? '';
    if (path !== '/' && path !== '') return false;
    return new URLSearchParams(location.search).has('new_loc');
  } catch {
    return false;
  }
}

export function isCoursePage(): boolean {
  try {
    return location.hostname === KING_LMS_HOSTNAME && /\/ultra\/course/.test(location.pathname);
  } catch {
    return false;
  }
}

export function isAssignmentSyncPage(): boolean {
  try {
    return location.hostname === KING_LMS_HOSTNAME && /\/ultra\/calendar/.test(location.pathname);
  } catch {
    return false;
  }
}

export function buildRedirectUrl(base: string, hash: string): string {
  try {
    const u = new URL(base);
    u.hash = hash;
    return u.href;
  } catch {
    return base.split('#')[0] + '#' + hash;
  }
}
