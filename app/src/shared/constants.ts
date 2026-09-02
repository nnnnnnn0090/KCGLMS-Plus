/**
 * 拡張機能全体で共有する定数です（後方互換再輸出）。
 * 新規コードは `src/contract/` を直接参照してください。
 */

export * from '../contract/storage-keys';
export * from '../contract/messages';
export * from '../contract/dom';
export * from '../contract/origins';
export * from '../contract/sync';

export {
  PORTAL_API,
  PORTAL_API_DELIVERED_NEWS_NENDO,
  isPortalApiUrl,
  pathIncludesPortalApiSegment,
  pathnameIncludesFragment,
  pathLastSegment,
} from '../contract/api-paths';

export { TIMING, pageFetchRetryDelayMs } from '../contract/timing';

export { ZINDEX } from '../contract/zindex';

export {
  KING_LMS_SAML_LOGIN_PATH,
  KING_LMS_SAML_APP_ID,
  KING_LMS_HOME_URL,
  KING_LMS_COURSE_SYNC_TARGET_URL,
  KING_LMS_ASSIGNMENT_SYNC_TARGET_URL,
  buildKingLmsSamlLoginUrl,
  isKingLmsSamlLoginUrl,
} from '../shared/king-lms-url';
