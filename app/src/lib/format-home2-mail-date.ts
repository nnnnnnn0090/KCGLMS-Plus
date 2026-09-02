import { localeForLanguage, type AppLanguage } from '../i18n/messages';

/** Home2 メール一覧・本文の日時セル用（RFC 2822 風・末尾の括弧注記を除去してパース） */

export function parseHome2MailDateMs(raw: string): number {
  const s = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '');
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : NaN;
}

export function home2MailDateTimeIso(raw: string): string | undefined {
  const ms = parseHome2MailDateMs(raw);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

/** 画面表示用。パースできないときは元文字列 */
export function formatHome2MailDateForDisplay(raw: string, language: AppLanguage = 'ja'): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const ms = parseHome2MailDateMs(trimmed);
  if (!Number.isFinite(ms)) return trimmed;
  return new Intl.DateTimeFormat(localeForLanguage(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(ms));
}
