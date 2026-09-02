/**
 * ポータル API の URL がフック対象かどうかを判定するためのヘルパーです。
 */

import {
  PORTAL_API,
  PORTAL_API_DELIVERED_NEWS_NENDO,
  pathIncludesPortalApiSegment,
  pathLastSegment,
  pathnameIncludesFragment,
} from '../../lib/api-paths';

export function toAbs(u: string): string {
  try {
    return new URL(u, location.href).href;
  } catch {
    return u;
  }
}

export function pathOf(u: string): string {
  try {
    let p = new URL(u, location.href).pathname;
    while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
  } catch {
    return '';
  }
}

const isNewTopics = (u: string) => pathIncludesPortalApiSegment(u, PORTAL_API.newTopics);
const isUserHtmlLinkMe = (u: string) => {
  const p = pathOf(u);
  return p.endsWith('/api/UserHtmlLink/Me');
};
const isUserHtmlLink = (u: string) =>
  pathIncludesPortalApiSegment(u, PORTAL_API.userHtmlLink) && !isUserHtmlLinkMe(u);
const isKogiCalendar = (u: string) => pathIncludesPortalApiSegment(u, PORTAL_API.kogiCalendar);
const isHoshuCalendar = (u: string) => pathIncludesPortalApiSegment(u, PORTAL_API.hoshuCalendar);
const isCampusCalendar = (u: string) => pathIncludesPortalApiSegment(u, PORTAL_API.campusCalendar);
const isKogiNews = (u: string) => pathIncludesPortalApiSegment(u, PORTAL_API.kogiNews);
const isKinoMessage = (u: string) => pathIncludesPortalApiSegment(u, PORTAL_API.portalKinoMessage);
const isDeliveredNendo = (u: string) =>
  pathnameIncludesFragment(u, PORTAL_API_DELIVERED_NEWS_NENDO);
const isKyukoInfo = (u: string) => pathLastSegment(u) === PORTAL_API.kyukoInfo;
const isHokoInfo = (u: string) => pathLastSegment(u) === PORTAL_API.hokoInfo;
const isKyoshitsuChange = (u: string) => pathLastSegment(u) === PORTAL_API.kyoshitsuChange;
const isQuestionnaireInfo = (u: string) => pathLastSegment(u) === PORTAL_API.questionnaireInfo;

function isDeliveredDetail(u: string): boolean {
  const p = pathOf(u);
  if (p.includes(PORTAL_API_DELIVERED_NEWS_NENDO)) return false;
  const segs = p.split('/').filter(Boolean);
  const ix = segs.indexOf(PORTAL_API.deliveredNews);
  return ix >= 0 && ix + 1 < segs.length && /^[0-9]+$/.test(segs[ix + 1]!);
}

export function shouldHook(u: string): boolean {
  return (
    isNewTopics(u) ||
    isUserHtmlLink(u) ||
    isUserHtmlLinkMe(u) ||
    isKogiCalendar(u) ||
    isHoshuCalendar(u) ||
    isCampusCalendar(u) ||
    isKogiNews(u) ||
    isKinoMessage(u) ||
    isDeliveredNendo(u) ||
    isDeliveredDetail(u) ||
    isKyukoInfo(u) ||
    isHokoInfo(u) ||
    isKyoshitsuChange(u) ||
    isQuestionnaireInfo(u)
  );
}

export {
  isNewTopics,
  isUserHtmlLink,
  isUserHtmlLinkMe,
  isKogiCalendar,
  isHoshuCalendar,
  isCampusCalendar,
  isKogiNews,
  isKinoMessage,
  isDeliveredNendo,
  isDeliveredDetail,
  isKyukoInfo,
  isHokoInfo,
  isKyoshitsuChange,
  isQuestionnaireInfo,
};
