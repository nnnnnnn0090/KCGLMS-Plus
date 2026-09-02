/**
 * 開発者お知らせ・アンケート JSON の取得と正規化（F-027/F-028）。
 */

import type { AppLanguage } from '../i18n/messages';
import {
  DEVELOPER_NOTICE_JSON_URL,
  DEVELOPER_SURVEY_JSON_URL,
  DEVELOPER_SURVEY_RESPONSE_URL,
} from '../contract/origins';
import { buildClientTelemetryHeaders } from './client-identity';
import { isPortalDistributionBuild } from '../contract/distribution-build';

/** JSON の接尾辞と一致（`title_zh_TW` / `message_zh_TW` など） */
export const DEVELOPER_NOTICE_LANG_IDS = [
  'ja',
  'en',
  'zh',
  'zh_TW',
  'ko',
  'vi',
  'ne',
  'id',
  'th',
] as const;

export type DeveloperNoticeLang = (typeof DEVELOPER_NOTICE_LANG_IDS)[number];

const SUFFIX: Record<DeveloperNoticeLang, string | null> = {
  ja: null,
  en: 'en',
  zh: 'zh',
  zh_TW: 'zh_TW',
  ko: 'ko',
  vi: 'vi',
  ne: 'ne',
  id: 'id',
  th: 'th',
};

export const DEVELOPER_NOTICE_SELECT_LABEL: Record<DeveloperNoticeLang, string> = {
  ja: '日本語',
  en: 'English',
  zh: '简体中文',
  zh_TW: '繁體中文',
  ko: '한국어',
  vi: 'Tiếng Việt',
  ne: 'नेपाली',
  id: 'Bahasa Indonesia',
  th: 'ไทย',
};

export const DEVELOPER_NOTICE_TITLE_FALLBACK: Record<DeveloperNoticeLang, string> = {
  ja: '開発者からのお知らせ',
  en: 'Developer notice',
  zh: '开发者通知',
  zh_TW: '擴充功能通知',
  ko: '개발자 안내',
  vi: 'Thông báo',
  ne: 'सूचना',
  id: 'Pemberitahuan',
  th: 'ประกาศ',
};

export interface DeveloperNoticeI18n {
  byLang: Record<DeveloperNoticeLang, { title: string; message: string }>;
  langOptions: DeveloperNoticeLang[];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function isDeveloperNoticeLang(v: unknown): v is DeveloperNoticeLang {
  return typeof v === 'string' && (DEVELOPER_NOTICE_LANG_IDS as readonly string[]).includes(v);
}

function rawTitle(json: Record<string, unknown>, id: DeveloperNoticeLang): string {
  const s = SUFFIX[id];
  return s ? str(json[`title_${s}`]) : '';
}

function rawMessage(json: Record<string, unknown>, id: DeveloperNoticeLang): string {
  if (id === 'ja') return str(json.message) || str(json.message_ja);
  const s = SUFFIX[id];
  return s ? str(json[`message_${s}`]) : '';
}

function fingerprint(x: { title: string; message: string }): string {
  return `${x.title}\0${x.message}`;
}

export function preferredNoticeLang(
  preferred: AppLanguage,
  notice: DeveloperNoticeI18n | null,
): DeveloperNoticeLang {
  if (!notice?.langOptions.length) return preferred;
  if (notice.langOptions.includes(preferred)) return preferred;
  if (notice.langOptions.includes('ja')) return 'ja';
  if (notice.langOptions.includes('en')) return 'en';
  return notice.langOptions[0] ?? preferred;
}

/** リロードのたびに最新を取る（ブラウザ・CDN キャッシュを避ける） */
export async function fetchDeveloperNoticeJson(): Promise<Response> {
  const url = new URL(DEVELOPER_NOTICE_JSON_URL);
  url.searchParams.set('_', String(Date.now()));

  if (!isPortalDistributionBuild()) {
    url.searchParams.set('contentOnly', '1');
    return fetch(url.toString(), { method: 'GET', cache: 'no-store' });
  }

  return fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
    headers: await buildClientTelemetryHeaders('GET', '/notice_md.json'),
  });
}

export function parseDeveloperNoticeJson(
  json: Record<string, unknown>,
): DeveloperNoticeI18n | null {
  let titleJa = str(json.title);
  let messageJa = rawMessage(json, 'ja');
  let hasJa = titleJa.length > 0 || messageJa.length > 0;

  let hasSecondaryRaw = false;
  for (const id of DEVELOPER_NOTICE_LANG_IDS) {
    if (id === 'ja') continue;
    if (rawTitle(json, id) || rawMessage(json, id)) {
      hasSecondaryRaw = true;
      break;
    }
  }

  if (!hasJa && hasSecondaryRaw) {
    for (const id of DEVELOPER_NOTICE_LANG_IDS) {
      if (id === 'ja') continue;
      const tr = rawTitle(json, id);
      const mr = rawMessage(json, id);
      if (tr || mr) {
        titleJa = tr || titleJa;
        messageJa = mr || messageJa;
        break;
      }
    }
    hasJa = titleJa.length > 0 || messageJa.length > 0;
  }

  const visible = hasJa || hasSecondaryRaw;
  if (!visible) return null;

  const byLang = {} as Record<DeveloperNoticeLang, { title: string; message: string }>;
  byLang.ja = { title: titleJa, message: messageJa };
  for (const id of DEVELOPER_NOTICE_LANG_IDS) {
    if (id === 'ja') continue;
    const tr = rawTitle(json, id);
    const mr = rawMessage(json, id);
    byLang[id] = {
      title: tr || titleJa,
      message: mr || messageJa,
    };
  }

  const langOptions: DeveloperNoticeLang[] = [];
  if (titleJa.length > 0 || messageJa.length > 0) langOptions.push('ja');
  for (const id of DEVELOPER_NOTICE_LANG_IDS) {
    if (id === 'ja') continue;
    if (rawTitle(json, id) || rawMessage(json, id)) langOptions.push(id);
  }

  void new Set(DEVELOPER_NOTICE_LANG_IDS.map((id) => fingerprint(byLang[id])));

  return { byLang, langOptions };
}

// ─── Survey ───────────────────────────────────────────────────────────────

export type DeveloperSurveyQuestionType = 'singleChoice' | 'multiChoice' | 'text' | 'textarea';

export interface DeveloperSurveyOption {
  id: string;
  label: string;
}

export interface DeveloperSurveyQuestion {
  id: string;
  type: DeveloperSurveyQuestionType;
  label: string;
  required: boolean;
  maxLength: number;
  options: DeveloperSurveyOption[];
}

export interface DeveloperSurvey {
  id: string;
  revision: string;
  title: string;
  description: string;
  questions: DeveloperSurveyQuestion[];
}

export type DeveloperSurveyAnswers = Record<string, string | string[]>;

type SurveyRaw = Record<string, unknown>;

const LANG_SUFFIX: Record<AppLanguage, string | null> = {
  ja: null,
  en: 'en',
  zh: 'zh',
  zh_TW: 'zh_TW',
  ko: 'ko',
  vi: 'vi',
  ne: 'ne',
  id: 'id',
  th: 'th',
};

const QUESTION_TYPES = new Set<DeveloperSurveyQuestionType>([
  'singleChoice',
  'multiChoice',
  'text',
  'textarea',
]);

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function localized(raw: SurveyRaw, base: string, language: AppLanguage): string {
  const suffix = LANG_SUFFIX[language];
  if (suffix) {
    const exact = str(raw[`${base}_${suffix}`]);
    if (exact) return exact;
  }
  return str(raw[base]) || str(raw[`${base}_ja`]) || str(raw[`${base}_en`]);
}

function normalizeOptions(raw: unknown, language: AppLanguage): DeveloperSurveyOption[] {
  if (!Array.isArray(raw)) return [];
  const out: DeveloperSurveyOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as SurveyRaw;
    const id = str(obj.id);
    const label = localized(obj, 'label', language);
    if (!id || !label) continue;
    out.push({ id, label });
  }
  return out;
}

export function normalizeDeveloperSurvey(
  raw: unknown,
  language: AppLanguage,
): DeveloperSurvey | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as SurveyRaw;
  if (!bool(obj.enabled)) return null;

  const id = str(obj.id);
  const revision = str(obj.revision);
  const title = localized(obj, 'title', language);
  const description = localized(obj, 'description', language);
  if (!id || !revision || !title || !Array.isArray(obj.questions)) return null;

  const questions: DeveloperSurveyQuestion[] = [];
  for (const item of obj.questions) {
    if (!item || typeof item !== 'object') continue;
    const q = item as SurveyRaw;
    const qid = str(q.id);
    const type = str(q.type) as DeveloperSurveyQuestionType;
    const label = localized(q, 'label', language);
    if (!qid || !QUESTION_TYPES.has(type) || !label) continue;
    const options = normalizeOptions(q.options, language);
    if ((type === 'singleChoice' || type === 'multiChoice') && options.length === 0) continue;
    questions.push({
      id: qid,
      type,
      label,
      required: bool(q.required),
      maxLength: num(q.maxLength, type === 'textarea' ? 1000 : 160),
      options,
    });
  }
  if (questions.length === 0) return null;

  return { id, revision, title, description, questions };
}

export function developerSurveyKey(survey: DeveloperSurvey): string {
  return `${survey.id}:${survey.revision}`;
}

export async function fetchDeveloperSurveyJson(): Promise<Response> {
  const headers = await buildClientTelemetryHeaders('GET', '/survey.json');
  headers['Content-Type'] = 'application/json';
  return fetch(`${DEVELOPER_SURVEY_JSON_URL}?_=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
    headers,
  });
}

export async function submitDeveloperSurveyResponse(
  surveyId: string,
  revision: string,
  answers: DeveloperSurveyAnswers,
): Promise<Response> {
  const headers = await buildClientTelemetryHeaders('POST', '/survey-response');
  headers['Content-Type'] = 'application/json';
  return fetch(`${DEVELOPER_SURVEY_RESPONSE_URL}?_=${Date.now()}`, {
    method: 'POST',
    cache: 'no-store',
    headers,
    body: JSON.stringify({ surveyId, revision, answers }),
  });
}
