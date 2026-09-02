/** ポータル REST API のパス断片（§8.1）。 */

export const PORTAL_API = {
  newTopics: 'NewTopics',
  userHtmlLink: 'UserHtmlLink',
  kogiCalendar: 'KogiCalendar',
  hoshuCalendar: 'HoshuCalendar',
  campusCalendar: 'CampusCalendar',
  kogiNews: 'KogiNews',
  portalKinoMessage: 'PortalKinoMessage',
  deliveredNews: 'DeliveredNews',
  kyukoInfo: 'KyukoInfo',
  hokoInfo: 'HokoInfo',
  kyoshitsuChange: 'KyoshitsuChangeInfo',
  questionnaireInfo: 'questionnaireInfo',
} as const;

/** DeliveredNews 年度一覧 API のパス断片（pathname 上） */
export const PORTAL_API_DELIVERED_NEWS_NENDO = '/api/DeliveredNews/Nendo/';

const PORTAL_API_PREFIX = '/portal/api/';

/** `/portal/api/` 配下の URL か（認証ヘッダー捕捉用） */
export function isPortalApiUrl(u: string): boolean {
  try {
    const p = new URL(u, location.href).pathname;
    return p.includes(PORTAL_API_PREFIX);
  } catch {
    return false;
  }
}

/** パス名に `/api/<segment>` が含まれるか（fetch フックの対象判定） */
export function pathIncludesPortalApiSegment(u: string, segment: string): boolean {
  try {
    let p = new URL(u, location.href).pathname;
    while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p.includes(`/api/${segment}`);
  } catch {
    return false;
  }
}

/** pathname に特定の断片が含まれるか */
export function pathnameIncludesFragment(u: string, fragment: string): boolean {
  try {
    return new URL(u, location.href).pathname.includes(fragment);
  } catch {
    return false;
  }
}

export function pathLastSegment(u: string): string {
  try {
    let p = new URL(u, location.href).pathname;
    while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    const parts = p.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1]! : '';
  } catch {
    return '';
  }
}

/** fetch フック: URL → MSG 種別の対応表 */
export const PORTAL_API_MSG_MAP = {
  [PORTAL_API.portalKinoMessage]: 'kinoMessage',
  [PORTAL_API.kogiCalendar]: 'kogiCalendar',
  [PORTAL_API.hoshuCalendar]: 'hoshuCalendar',
  [PORTAL_API.campusCalendar]: 'campusCalendar',
  [PORTAL_API.kyukoInfo]: 'kyukoInfo',
  [PORTAL_API.hokoInfo]: 'hokoInfo',
  [PORTAL_API.kyoshitsuChange]: 'kyoshitsuChange',
  [PORTAL_API.questionnaireInfo]: 'questionnaireInfo',
  [PORTAL_API.deliveredNews]: 'deliveredNews',
  [PORTAL_API.newTopics]: 'newTopics',
  [PORTAL_API.kogiNews]: 'kogiNews',
  [PORTAL_API.userHtmlLink]: 'userHtmlLink',
} as const;
