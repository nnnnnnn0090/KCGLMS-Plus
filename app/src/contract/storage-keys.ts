/** `chrome.storage.local` のキー（§4.6.1）と background 用キー。 */

export const SK = {
  hideProfileName: 'portalThemeHideProfileName',
  theme: 'portalThemeColorTheme',
  customThemes: 'portalThemeCustomThemes',
  /** 授業カレンダー「追加予定」のユーザー予定（マイリンク同期対象） */
  customCalEvents: 'portalThemeCustomCalEvents',
  /** 追加予定帯を折りたたんでいるか（未設定時は予定の有無で決める） */
  customCalBandCollapsed: 'portalThemeCustomCalBandCollapsed',
  showKogiCalMascot: 'portalThemeShowKogiCalMascot',
  showHomeCornerCharacter: 'portalThemeShowHomeCornerCharacter',
  /** ホームの King LMS 連携「課題」カレンダーを表示しない */
  hideAssignmentCalendar: 'portalThemeHideAssignmentCalendar',
  kingLmsCourses: 'portalThemeKingLmsCourses',
  kingLmsAssignmentDue: 'portalThemeKingLmsAssignmentDue',
  kingLmsSyncPending: 'portalThemeKingLmsSyncPending',
  kingLmsSyncReturnUrl: 'portalThemeKingLmsSyncReturnUrl',
  kingLmsSyncAwaitCourse: 'portalThemeKingLmsSyncAwaitCourse',
  /** 設定パネルからのコース一覧再取得のとき true（戻りトーストを短くする） */
  kingLmsCourseSyncToastQuiet: 'portalThemeKingLmsCourseSyncToastQuiet',
  kingLmsAssignmentSyncPending: 'portalThemeKingLmsAssignmentSyncPending',
  kingLmsAssignmentSyncReturnUrl: 'portalThemeKingLmsAssignmentSyncReturnUrl',
  kingLmsAssignmentSyncAwaitCalendar: 'portalThemeKingLmsAssignmentSyncAwaitCalendar',
  /** 課題同期でホームへ戻った直後、課題カレンダーへスクロールする（読み取り後に false に戻す） */
  portalScrollToAssignmentOnce: 'portalThemeScrollToAssignmentOnce',
  shortcutConfig: 'portalThemeShortcutConfig',
  /** v2 オンボーディングを完了（またはスキップ）したら true */
  portalGuidedTourDone: 'portalThemePortalOnboardingV2Done',
  /** 初回の言語選択を完了したら true */
  portalLanguagePickerDone: 'portalThemePortalLanguagePickerDone',
  home2WebMailOverlay: 'portalThemeHome2WebMailOverlay',
  cplanOverlay: 'portalThemeCplanOverlay',
  /** カレンダーグリッドの週の左端: `monday` | `sunday` */
  calendarWeekStart: 'portalThemeCalendarWeekStart',
  /** 拡張 UI の表示言語 */
  language: 'portalThemeLanguage',
  /** 拡張 UI のフォント（`default` | `zen-maru-gothic` | …） */
  font: 'portalThemeUiFont',
  /**
   * マイリンク経由で設定を端末間同期するか。
   * 端末ローカルのみ（マイリンク同期対象外）。未設定時は true。
   */
  syncViaMyLinks: 'portalThemeSyncViaMyLinks',
  /** 更新通知済みの拡張 manifest version（`readExtensionVersion()` と比較） */
  extensionVersionSeen: 'portalThemeExtensionVersionSeen',
  /** 開発者お知らせパネルの表示言語（`ja` / `en` / `zh` / `zh_TW` / `ko` / `vi` / `ne` / `id` / `th`） */
  developerNoticeLang: 'portalThemeDeveloperNoticeLang',
  /** 開発者アンケートの回答済み状態（`surveyId:revision` の配列） */
  developerSurveyAnswered: 'portalThemeDeveloperSurveyAnswered',
  /** 匿名ユーザー ID（マイリンク同期 JSON のみ。notice.json 等の識別用） */
  clientUserId: 'portalThemeClientUserId',
  /** 拡張の初回記録日時（ISO 8601） */
  clientInstallAt: 'portalThemeClientInstallAt',
  /** 拡張の最終バージョン更新日時（ISO 8601） */
  clientLastUpdatedAt: 'portalThemeClientLastUpdatedAt',
  /** ライフサイクル追跡用の最後に記録した manifest version */
  clientLastKnownVersion: 'portalThemeClientLastKnownVersion',
  /** 「みんなの活動」が学校公式サービスではないことへの初回同意 */
  communityDisclaimerAccepted: 'portalThemeCommunityDisclaimerAccepted',
} as const;

/** background: 初回インストール後のポータル自動オープン待ち */
export const INSTALL_OPEN_PENDING_KEY = 'portalInstallOpenPending' as const;

export const PAGE = {
  HOME: 'home',
  NEWS: 'news',
  DETAIL: 'detail',
  KYUKO: 'kyuko',
  SURVEY: 'survey',
} as const;

export type PageType = (typeof PAGE)[keyof typeof PAGE];
