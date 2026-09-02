import { APP_LANGUAGES, DEFAULT_LANGUAGE, type AppLanguage } from './messages';

/** 初回インストール時: ブラウザ言語から UI 言語を推定（F-022） */
export function detectDefaultLanguage(): AppLanguage {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const raw of langs) {
      const tag = String(raw ?? '')
        .trim()
        .toLowerCase();
      if (!tag) continue;
      if (tag.startsWith('ja')) return 'ja';
      if (tag.startsWith('en')) return 'en';
      if (tag === 'zh-tw' || tag === 'zh-hk' || tag === 'zh-hant') return 'zh_TW';
      if (tag.startsWith('zh')) return 'zh';
      if (tag.startsWith('ko')) return 'ko';
      if (tag.startsWith('vi')) return 'vi';
      if (tag.startsWith('ne')) return 'ne';
      if (tag.startsWith('id')) return 'id';
      if (tag.startsWith('th')) return 'th';
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LANGUAGE;
}

/** `document.documentElement.lang` 用の BCP 47 タグ（F-022） */
export function documentElementLangForLanguage(language: AppLanguage): string {
  return language === 'zh_TW' ? 'zh-Hant' : language.replace('_', '-');
}

export function isAppLanguage(value: string): value is AppLanguage {
  return (APP_LANGUAGES as readonly string[]).includes(value);
}
