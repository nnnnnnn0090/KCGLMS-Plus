import { describe, expect, it } from 'vitest';
import { messagesForLanguage } from '../i18n/messages';
import { resolvePortalNavLabel } from './portal-nav-labels';

describe('resolvePortalNavLabel', () => {
  const ja = messagesForLanguage('ja');
  const en = messagesForLanguage('en');

  it('keeps Japanese host labels in ja mode except Webサービス', () => {
    expect(resolvePortalNavLabel('/portal/News', 'お知らせ一覧', ja, 'ja')).toBe('お知らせ一覧');
    expect(resolvePortalNavLabel('/portal/foo', 'Webサービス', ja, 'ja')).toBe('キャンパスプラン');
  });

  it('translates known portal nav items in en mode', () => {
    expect(resolvePortalNavLabel('/portal', 'ホーム', en, 'en')).toBe('Home');
    expect(resolvePortalNavLabel('/portal/News', 'お知らせ一覧', en, 'en')).toBe('Notice list');
    expect(resolvePortalNavLabel('/portal/KyukoHokoEtc', '休講補講等一覧', en, 'en')).toBe(
      'Cancellations & make-up',
    );
    expect(resolvePortalNavLabel('/portal/Questionnaire', '授業評価アンケート回答', en, 'en')).toBe(
      'Course evaluations',
    );
    expect(resolvePortalNavLabel('/portal/Cabinet', 'キャビネット', en, 'en')).toBe('Cabinet');
    expect(resolvePortalNavLabel('/portal/foo', 'Webサービス', en, 'en')).toBe('Campus plan');
  });

  it('translates known portal nav items in zh mode', () => {
    const zh = messagesForLanguage('zh');
    expect(resolvePortalNavLabel('/portal/News', 'お知らせ一覧', zh, 'zh')).toBe('公告列表');
    expect(resolvePortalNavLabel('/portal/KyukoHokoEtc', '休講補講等一覧', zh, 'zh')).toBe(
      '停课与补课',
    );
  });
});
