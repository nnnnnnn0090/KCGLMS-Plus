/**
 * ポータル本体のナビ（ホスト DOM 由来の日本語ラベル）を拡張 UI 言語へ写す。
 */

import type { AppLanguage, I18nMessages } from '../i18n/messages';

export type PortalNavHostKey =
  | 'home'
  | 'newsList'
  | 'kyukoHoko'
  | 'questionnaire'
  | 'cabinet'
  | 'campusPlan'
  | 'profile';

/** ホスト側の表示文言（完全一致）→ 翻訳キー */
const HOST_LABEL_KEYS: Record<string, PortalNavHostKey> = {
  ホーム: 'home',
  お知らせ一覧: 'newsList',
  休講補講等一覧: 'kyukoHoko',
  授業評価アンケート回答: 'questionnaire',
  キャビネット: 'cabinet',
  Webサービス: 'campusPlan',
  キャンパスプラン: 'campusPlan',
  プロフィール: 'profile',
};

function normalizeHostLabel(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function portalPathKey(href: string): PortalNavHostKey | null {
  try {
    const path = new URL(href, location.origin).pathname.replace(/\/+$/, '') || '/portal';
    if (path === '/portal' || path === '/portal/Home') return 'home';
    if (path === '/portal/News') return 'newsList';
    if (path === '/portal/KyukoHokoEtc') return 'kyukoHoko';
    if (path === '/portal/Questionnaire') return 'questionnaire';
    if (path === '/portal/Cabinet' || path.startsWith('/portal/Cabinet/')) return 'cabinet';
    if (path === '/portal/Profile') return 'profile';
  } catch {
    /* ignore */
  }
  return null;
}

function portalHostLabel(t: I18nMessages, key: PortalNavHostKey): string {
  return t.nav.portalHost[key];
}

/** ポータルヘッダーナビの表示ラベルを決定する */
export function resolvePortalNavLabel(
  href: string,
  hostLabel: string,
  t: I18nMessages,
  language: AppLanguage,
): string {
  const trimmed = normalizeHostLabel(hostLabel);
  const pathKey = href ? portalPathKey(href) : null;
  const labelKey = HOST_LABEL_KEYS[trimmed] ?? pathKey;

  if (language === 'ja') {
    if (labelKey === 'campusPlan' || trimmed === 'Webサービス') return t.nav.campusPlan;
    return trimmed;
  }

  if (labelKey) return portalHostLabel(t, labelKey);
  return trimmed;
}
