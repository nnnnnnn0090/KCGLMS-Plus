/** postMessage 種別（§4.6.5）。 */

export const MSG = {
  kinoMessage: 'portalThemePortalKinoMessageCaptured',
  kogiCalendar: 'portalThemeKogiCalendarCaptured',
  hoshuCalendar: 'portalThemeHoshuCalendarCaptured',
  campusCalendar: 'portalThemeCampusCalendarCaptured',
  kyukoInfo: 'portalThemeKyukoInfoCaptured',
  hokoInfo: 'portalThemeHokoInfoCaptured',
  kyoshitsuChange: 'portalThemeKyoshitsuChangeInfoCaptured',
  questionnaireInfo: 'portalThemeQuestionnaireInfoCaptured',
  deliveredNewsDetail: 'portalThemeDeliveredNewsDetailCaptured',
  deliveredNews: 'portalThemeDeliveredNewsCaptured',
  newTopics: 'portalThemeNewTopicsCaptured',
  kogiNews: 'portalThemeKogiNewsCaptured',
  userHtmlLink: 'portalThemeUserHtmlLinkCaptured',
  userHtmlLinkMe: 'portalThemeUserHtmlLinkMeCaptured',
} as const;

export type MsgType = (typeof MSG)[keyof typeof MSG];

export const FETCH_HOOK = {
  /** postMessage の source（fetch フック由来） */
  source: 'portalThemeFetchObserver',
  /** キャプチャ済みメッセージの再送要求 */
  replayRequest: 'portalThemeReplayIntercepted',
  /** pageFetch 依頼 */
  pageFetch: 'portalThemePageFetchRequest',
  /** 認証付き API 呼び出し（GET/POST） */
  portalApiRequest: 'portalThemePortalApiRequest',
  /** portalApiRequest の応答 */
  portalApiResponse: 'portalThemePortalApiResponse',
  /** 学ポータル本体 `li.logoff` のログアウト（MAIN ワールドで実行） */
  logoffTrigger: 'portalThemeLogoffTrigger',
} as const;

export const KING_LMS_HOOK = {
  source: 'portalThemeKingLmsHook',
  syncAbortType: 'portalThemeKingLmsSyncAbort',
  coursesPostType: 'portalThemeKingLmsCourses',
  assignmentDuePostType: 'portalThemeKingLmsAssignmentDue',
  assignmentProgressType: 'portalThemeKingLmsAssignmentProgress',
} as const;

/** `window` で発火。`X-CPAuthorize` がキャプチャされたあと pageFetch ブリッジが待機解除する */
export const PORTAL_CP_AUTHORIZE_READY = 'portalCpAuthorizeReady' as const;
