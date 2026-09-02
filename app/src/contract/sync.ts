/** King LMS 同期ハッシュ・SAML URL（§4.6.4）。 */

export const SYNC_HASH = {
  courseDone: 'portal-king-lms-sync-ok',
  courseTimeout: 'portal-king-lms-sync-timeout',
  assignmentDone: 'portal-king-lms-assignment-sync-ok',
  assignmentTimeout: 'portal-king-lms-assignment-sync-timeout',
  assignmentError: 'portal-king-lms-assignment-sync-error',
} as const;

export const KING_LMS_SAML_LOGIN_PATH = '/auth-saml/saml/login' as const;
export const KING_LMS_SAML_APP_ID = '_4_1' as const;

export const KING_LMS_HOME_URL = 'https://king-lms.kcg.edu/ultra' as const;
export const KING_LMS_COURSE_SYNC_TARGET_URL = 'https://king-lms.kcg.edu/ultra/course' as const;
export const KING_LMS_ASSIGNMENT_SYNC_TARGET_URL =
  'https://king-lms.kcg.edu/ultra/calendar' as const;

export const KING_LMS_COURSE_SYNC_URL =
  'https://king-lms.kcg.edu/auth-saml/saml/login?apId=_4_1&redirectUrl=https%3A%2F%2Fking-lms.kcg.edu%2Fultra%2Fcourse' as const;

export const KING_LMS_ASSIGNMENT_SYNC_URL =
  'https://king-lms.kcg.edu/auth-saml/saml/login?apId=_4_1&redirectUrl=https%3A%2F%2Fking-lms.kcg.edu%2Fultra%2Fcalendar' as const;
