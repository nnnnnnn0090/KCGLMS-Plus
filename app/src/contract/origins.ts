/** Origin / URL / content script matches 凍結値。 */

import { isPortalDistributionBuild } from './distribution-build';

export const PORTAL_ORIGIN = 'https://home.kcg.ac.jp' as const;

/** `location.hostname` 比較用 */
export const PORTAL_HOSTNAME = new URL(PORTAL_ORIGIN).hostname;

/** ポータル配下コンテンツスクリプトの manifest `matches` */
export const PORTAL_CONTENT_SCRIPT_MATCHES = `${PORTAL_ORIGIN}/portal*` as const;

/** Campus Plan Web（パス先頭の大文字・小文字違いを含む） */
export const CPLAN_CONTENT_SCRIPT_MATCHES = [
  `${PORTAL_ORIGIN}/gakusei/web/CplanMenuWeb/UI/*`,
  `${PORTAL_ORIGIN}/Gakusei/web/CplanMenuWeb/UI/*`,
  `${PORTAL_ORIGIN}/gakusei/web/skt/WebSktGakuseiShukketsuShinsei/UI/*`,
  `${PORTAL_ORIGIN}/Gakusei/web/skt/WebSktGakuseiShukketsuShinsei/UI/*`,
] as const;

/** Home2 Web メール（専用 content script） */
export const HOME2_ORIGIN = 'https://home2.kcg.ac.jp' as const;

export const HOME2_HOSTNAME = new URL(HOME2_ORIGIN).hostname;

/** `/Mail`・`/Mail/`・`/Mail/*` いずれにもマッチさせる */
export const HOME2_MAIL_CONTENT_SCRIPT_MATCHES = [
  `${HOME2_ORIGIN}/Mail`,
  `${HOME2_ORIGIN}/Mail/`,
  `${HOME2_ORIGIN}/Mail/*`,
] as const;

export const HOME2_MAIL_DEFAULT_URL = `${HOME2_ORIGIN}/Mail/Default.aspx` as const;

export const HOME2_MAIL_DIRECTORY_URL = `${HOME2_ORIGIN}/Mail/` as const;

/** ヘッダー「ホーム」→ Default.aspx */
export const HOME2_TOP_PAGE_URL = `${HOME2_ORIGIN}/Default.aspx` as const;

export const KING_LMS_ORIGIN = 'https://king-lms.kcg.edu' as const;
export const KING_LMS_HOSTNAME = new URL(KING_LMS_ORIGIN).hostname;

/** 拡張紹介ページ・開発者お知らせ JSON のオリジン（host_permissions と URL 生成用） */
export const EXTENSION_PROMO_ORIGIN = 'https://kcg-portal-redesign-project-web.vercel.app' as const;

/** みんなの活動 API（host_permissions と community-access 許可リスト用） */
export const COMMUNITY_API_ORIGIN = 'https://portal-community.com' as const;

const COMMUNITY_E2E_API_ORIGINS = ['http://127.0.0.1:8787', 'http://localhost:8787'] as const;

/** 拡張が接続を許可するコミュニティ API origin（manifest host_permissions と一致させる） */
export function listAllowedCommunityApiOrigins(): readonly string[] {
  if (isPortalDistributionBuild()) {
    return [COMMUNITY_API_ORIGIN];
  }
  return [COMMUNITY_API_ORIGIN, ...COMMUNITY_E2E_API_ORIGINS];
}

export function isAllowedCommunityApiOrigin(origin: string): boolean {
  const normalized = normalizeCommunityApiOrigin(origin);
  if (!normalized) return false;
  return listAllowedCommunityApiOrigins().includes(normalized);
}

export function normalizeCommunityApiOrigin(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

/** 拡張機能紹介ページ */
export const EXTENSION_PROMO_PAGE_URL = `${EXTENSION_PROMO_ORIGIN}/` as const;

/** ホーム最上部「開発者からのお知らせ」用 Markdown JSON（`title` / `message`） */
export const DEVELOPER_NOTICE_JSON_URL = `${EXTENSION_PROMO_ORIGIN}/notice_md.json` as const;

/** ホーム最上部「開発者アンケート」用 JSON */
export const DEVELOPER_SURVEY_JSON_URL = `${EXTENSION_PROMO_ORIGIN}/survey.json` as const;

/** 開発者アンケート回答送信用エンドポイント */
export const DEVELOPER_SURVEY_RESPONSE_URL = `${EXTENSION_PROMO_ORIGIN}/survey-response` as const;

/** 「みんなの活動」入口の公開可否を匿名UUIDで確認するエンドポイント */
export const COMMUNITY_ACCESS_URL = `${EXTENSION_PROMO_ORIGIN}/community-access` as const;

/** 拡張機能マスタースイッチ（monitor から全停止） */
export const EXTENSION_ENABLED_URL = `${EXTENSION_PROMO_ORIGIN}/extension-enabled` as const;

/** notice.json 等へ付与する匿名ユーザー識別子ヘッダー */
export const CLIENT_USER_ID_HEADER = 'X-KCG-Portal-User-Id' as const;

/** notice.json 等へ付与する拡張機能バージョンヘッダー（manifest version） */
export const EXTENSION_VERSION_HEADER = 'X-KCG-Portal-Extension-Version' as const;

/** notice.json 等へ付与するインストール日時ヘッダー（ISO 8601） */
export const CLIENT_INSTALL_AT_HEADER = 'X-KCG-Portal-Install-At' as const;

/** notice.json 等へ付与する最終更新日時ヘッダー（ISO 8601） */
export const CLIENT_LAST_UPDATED_AT_HEADER = 'X-KCG-Portal-Last-Updated-At' as const;

/** extension-update 通知へ付与する更新前バージョンヘッダー */
export const CLIENT_PREVIOUS_VERSION_HEADER = 'X-KCG-Portal-Previous-Version' as const;

/** 拡張バージョン更新時に Web へ通知するエンドポイント（Web 側で Discord 通知） */
export const EXTENSION_UPDATE_NOTIFY_URL = `${EXTENSION_PROMO_ORIGIN}/extension-update` as const;

/** 設定の「チェンジログ」用・利用者向け更新履歴 JSON */
export const CHANGELOG_JSON_URL = `${EXTENSION_PROMO_ORIGIN}/changelog.json` as const;

/** フッタークレジットの作者プロフィール（X） */
export const EXTENSION_AUTHOR_PROFILE_URL = 'https://x.com/nnnnnnn0090';

/** `Redesigned by` のリンク文言（`EXTENSION_AUTHOR_PROFILE_URL` と対） */
export const EXTENSION_AUTHOR_CREDIT_TEXT = 'nnnnnnn0090' as const;

function vitePrivateUrl(
  key: 'VITE_PORTAL_DISCORD_INVITE_URL' | 'VITE_EXTENSION_FEEDBACK_FORM_URL',
): string {
  const raw =
    key === 'VITE_PORTAL_DISCORD_INVITE_URL'
      ? import.meta.env.VITE_PORTAL_DISCORD_INVITE_URL
      : import.meta.env.VITE_EXTENSION_FEEDBACK_FORM_URL;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Discord 招待 URL。`VITE_PORTAL_DISCORD_INVITE_URL` を `app/.env.local` などに書きビルドする（Git に含めない）。
 * 未設定・空のときは設定パネルに Discord ボタンを出さない。
 */
export const PORTAL_COMMUNITY_DISCORD_INVITE_URL = vitePrivateUrl('VITE_PORTAL_DISCORD_INVITE_URL');

/**
 * バグ報告・機能リクエスト用フォーム URL。`VITE_EXTENSION_FEEDBACK_FORM_URL` を同様に設定。
 * 未設定のときはフォーム用ボタンを出さない。
 */
export const EXTENSION_FEEDBACK_FORM_URL = vitePrivateUrl('VITE_EXTENSION_FEEDBACK_FORM_URL');

/** ホームのショートカットに常に含める固定リンク */
export const HOME_SHORTCUT_EXTRAS: ReadonlyArray<{
  readonly midashi: string;
  readonly url: string;
}> = [
  {
    midashi: '学生出欠登録',
    url: `${PORTAL_ORIGIN}/gakusei/web/skt/WebSktGakuseiShukketsuShinsei/UI/WSK_GakuseiShukketsuShinsei.aspx`,
  },
  {
    midashi: 'KCG WebMail',
    url: HOME2_MAIL_DIRECTORY_URL,
  },
];
