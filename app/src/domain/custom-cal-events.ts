/**
 * 授業カレンダー「追加予定」帯に載せるユーザー予定の型と永続化パース。
 * weekday は `Date#getDay()` と同じく 0=日曜 … 6=土曜。
 * 時刻は任意の `HH:MM`（24時間表記）。
 * リンクは http(s) のみ、最大 4 件（オンライン授業用）。
 */

import { parseIsoLocal } from '../lib/date';

export const CUSTOM_CAL_EVENTS_SCHEMA_VERSION = 1 as const;
export const CUSTOM_CAL_EVENT_URLS_MAX = 4 as const;
/** インポートや壊れた同期データで無制限にUI・同期領域を消費しないための上限。 */
export const CUSTOM_CAL_EVENTS_MAX = 100 as const;

export type CustomCalWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CustomCalEventBase {
  id: string;
  title: string;
  note?: string;
  /** 開始時刻 `HH:MM`（未設定なら終日扱い） */
  timeStart?: string;
  /** 終了時刻 `HH:MM`（開始があるときのみ有効） */
  timeEnd?: string;
  /** 関連リンク（http/https、最大 4） */
  urls?: string[];
  createdAt: string;
  updatedAt: string;
}

export type CustomCalEvent = CustomCalEventBase &
  ({ kind: 'recurring'; weekday: CustomCalWeekday } | { kind: 'once'; date: string });

export interface StoredCustomCalEventCollection {
  schemaVersion: typeof CUSTOM_CAL_EVENTS_SCHEMA_VERSION;
  events: CustomCalEvent[];
}

export const EMPTY_CUSTOM_CAL_EVENTS: StoredCustomCalEventCollection = {
  schemaVersion: CUSTOM_CAL_EVENTS_SCHEMA_VERSION,
  events: [],
};

type CustomCalEventDraftBase = {
  title: string;
  note?: string;
  timeStart?: string;
  timeEnd?: string;
  urls?: string[];
};

export type CustomCalEventDraft =
  | (CustomCalEventDraftBase & { kind: 'recurring'; weekday: CustomCalWeekday })
  | (CustomCalEventDraftBase & { kind: 'once'; date: string });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[\w-]{6,80}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TITLE_MAX = 80;
const NOTE_MAX = 200;
/** Teams の meetup-join URL は context 付きで 1KB 超えることが多い */
const URL_MAX = 2048;
const FALLBACK_TIMESTAMP = new Date(0).toISOString();

function safeId(value: unknown): string | null {
  if (typeof value !== 'string' || !ID_RE.test(value)) return null;
  return value;
}

function safeTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.trim().slice(0, TITLE_MAX);
  return title.length > 0 ? title : null;
}

function safeNote(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const note = value.trim().slice(0, NOTE_MAX);
  return note.length > 0 ? note : undefined;
}

/** `HH:MM`。空文字・未設定は undefined */
export function safeTimeHm(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!TIME_RE.test(trimmed)) return undefined;
  return trimmed;
}

function normalizeTimes(
  timeStartRaw: unknown,
  timeEndRaw: unknown,
): { timeStart?: string; timeEnd?: string } {
  const timeStart = safeTimeHm(timeStartRaw);
  const timeEnd = safeTimeHm(timeEndRaw);
  if (!timeStart) return {};
  if (!timeEnd || timeEnd < timeStart) return { timeStart };
  return { timeStart, timeEnd };
}

function ensureHttpScheme(raw: string): string | null {
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):/i)?.[1];
  // `example.com:8443` の `example.com` を URL スキームと誤認しない。
  const isHostWithPort = /^(?:localhost|[^/?#\s:]+\.[^/?#\s:]+):\d+(?:[/?#]|$)/i.test(raw);
  if (scheme && !isHostWithPort) return /^https?$/i.test(scheme) ? raw : null;
  return /^[a-z0-9]/i.test(raw) ? `https://${raw}` : null;
}

/** http(s) のみ。スキーム無しは https:// を補う */
export function normalizeCustomCalEventUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let raw = value.trim();
  if (!raw) return null;
  // 先に切ると Teams URL が同一化・破損しやすいので、パース後に長さ判定する
  if (raw.length > URL_MAX * 2) return null;
  const normalized = ensureHttpScheme(raw);
  if (!normalized) return null;
  raw = normalized;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    if (u.href.length > URL_MAX) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** 最大 4 件・重複除去。空なら undefined */
export function safeCustomCalEventUrls(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (out.length >= CUSTOM_CAL_EVENT_URLS_MAX) break;
    const url = normalizeCustomCalEventUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out.length > 0 ? out : undefined;
}

/** プレビュー用の短い表示ラベル */
export function formatCustomCalEventUrlLabel(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '');
    const path = u.pathname === '/' ? '' : u.pathname;
    const full = `${host}${path}${u.search}`;
    return full.length > 52 ? `${full.slice(0, 49)}…` : full;
  } catch {
    return url.length > 52 ? `${url.slice(0, 49)}…` : url;
  }
}

function safeWeekday(value: unknown): CustomCalWeekday | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 6) return null;
  return value as CustomCalWeekday;
}

function safeIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const d = parseIsoLocal(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const normalized = `${y}-${m}-${day}`;
  return normalized === value ? value : null;
}

function safeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
}

function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
}

/** 表示用: `09:30` / `09:30–11:00` / 空（終日） */
export function formatCustomCalEventTime(
  ev: Pick<CustomCalEventBase, 'timeStart' | 'timeEnd'>,
): string {
  if (!ev.timeStart) return '';
  if (ev.timeEnd && ev.timeEnd !== ev.timeStart) return `${ev.timeStart}–${ev.timeEnd}`;
  return ev.timeStart;
}

/** 表示用: 時刻または終日ラベル */
export function formatCustomCalEventTimeLabel(
  ev: Pick<CustomCalEventBase, 'timeStart' | 'timeEnd'>,
  allDayLabel: string,
): string {
  return formatCustomCalEventTime(ev) || allDayLabel;
}

function timeSortKey(ev: Pick<CustomCalEventBase, 'timeStart'>): string {
  return ev.timeStart ?? '99:99';
}

function parseStoredCustomCalEvent(candidate: unknown): CustomCalEvent | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const item = candidate as Partial<CustomCalEvent> & { kind?: unknown };
  const id = safeId(item.id);
  const title = safeTitle(item.title);
  if (!id || !title) return null;

  const note = safeNote(item.note);
  const { timeStart, timeEnd } = normalizeTimes(item.timeStart, item.timeEnd);
  const urls = safeCustomCalEventUrls(item.urls);
  const createdAt = safeTimestamp(item.createdAt, FALLBACK_TIMESTAMP);
  const updatedAt = safeTimestamp(item.updatedAt, createdAt);

  if (item.kind === 'recurring') {
    const weekday = safeWeekday((item as { weekday?: unknown }).weekday);
    if (weekday === null) return null;
    return {
      id,
      title,
      note,
      timeStart,
      timeEnd,
      urls,
      kind: 'recurring',
      weekday,
      createdAt,
      updatedAt,
    };
  }

  if (item.kind === 'once') {
    const date = safeIsoDate((item as { date?: unknown }).date);
    if (!date) return null;
    return {
      id,
      title,
      note,
      timeStart,
      timeEnd,
      urls,
      kind: 'once',
      date,
      createdAt,
      updatedAt,
    };
  }

  return null;
}

export interface CustomCalEventParseResult {
  collection: StoredCustomCalEventCollection;
  rejectedCount: number;
  truncated: boolean;
}

export function parseCustomCalEventCollectionWithReport(raw: unknown): CustomCalEventParseResult {
  if (!raw || typeof raw !== 'object') {
    return { collection: EMPTY_CUSTOM_CAL_EVENTS, rejectedCount: 0, truncated: false };
  }
  const input = raw as { schemaVersion?: unknown; events?: unknown };
  if (input.schemaVersion !== CUSTOM_CAL_EVENTS_SCHEMA_VERSION || !Array.isArray(input.events)) {
    return { collection: EMPTY_CUSTOM_CAL_EVENTS, rejectedCount: 0, truncated: false };
  }

  const events: CustomCalEvent[] = [];
  const seen = new Set<string>();
  let rejectedCount = 0;

  for (const candidate of input.events) {
    const event = parseStoredCustomCalEvent(candidate);
    if (!event || seen.has(event.id)) {
      rejectedCount += 1;
      continue;
    }
    seen.add(event.id);
    events.push(event);
  }

  // 保存済みの予定は上限を超えても捨てない（同期で2台分が合わさった場合など）。
  // 捨てると、次の保存で「削除」として全端末に広がってしまう。上限は追加・読み込み時に守る。
  const truncated = events.length > CUSTOM_CAL_EVENTS_MAX;
  return {
    collection: { schemaVersion: CUSTOM_CAL_EVENTS_SCHEMA_VERSION, events },
    rejectedCount,
    truncated,
  };
}

export function parseCustomCalEventCollection(raw: unknown): StoredCustomCalEventCollection {
  return parseCustomCalEventCollectionWithReport(raw).collection;
}

function buildCustomCalEvent(
  input: CustomCalEventDraft,
  metadata: Pick<CustomCalEventBase, 'id' | 'createdAt' | 'updatedAt'>,
): CustomCalEvent | null {
  const title = safeTitle(input.title);
  if (!title) return null;
  const note = safeNote(input.note);
  const { timeStart, timeEnd } = normalizeTimes(input.timeStart, input.timeEnd);
  const urls = safeCustomCalEventUrls(input.urls);

  if (input.kind === 'recurring') {
    const weekday = safeWeekday(input.weekday);
    if (weekday === null) return null;
    return {
      ...metadata,
      title,
      note,
      timeStart,
      timeEnd,
      urls,
      kind: 'recurring',
      weekday,
    };
  }

  const date = safeIsoDate(input.date);
  if (!date) return null;
  return {
    ...metadata,
    title,
    note,
    timeStart,
    timeEnd,
    urls,
    kind: 'once',
    date,
  };
}

export function createCustomCalEvent(input: CustomCalEventDraft): CustomCalEvent | null {
  const now = new Date().toISOString();
  return buildCustomCalEvent(input, {
    id: newId(),
    createdAt: now,
    updatedAt: now,
  });
}

export function updateCustomCalEvent(
  previous: CustomCalEvent,
  patch: CustomCalEventDraft,
): CustomCalEvent | null {
  return buildCustomCalEvent(patch, {
    id: previous.id,
    createdAt: previous.createdAt,
    updatedAt: new Date().toISOString(),
  });
}

/** 指定日（YYYY-MM-DD）に表示する予定（繰り返し + その日の単発）。時刻昇順 */
export function customCalEventsForIsoDate(
  events: readonly CustomCalEvent[],
  iso: string,
): CustomCalEvent[] {
  if (!safeIsoDate(iso)) return [];
  const weekday = parseIsoLocal(iso).getDay() as CustomCalWeekday;
  return events
    .filter((ev) => {
      if (ev.kind === 'recurring') return ev.weekday === weekday;
      return ev.date === iso;
    })
    .sort((a, b) => {
      const ta = timeSortKey(a);
      const tb = timeSortKey(b);
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.title.localeCompare(b.title, 'ja');
    });
}

export function customCalEventsFingerprint(events: readonly CustomCalEvent[]): string {
  let hash = 0x811c9dc5;
  const add = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  const addField = (value: string) => {
    add(String(value.length));
    add(':');
    add(value);
  };
  for (const event of events) {
    addField(event.id);
    addField(event.title);
    addField(event.note ?? '');
    addField(event.timeStart ?? '');
    addField(event.timeEnd ?? '');
    for (const url of event.urls ?? []) addField(url);
    addField(event.kind === 'recurring' ? `r${event.weekday}` : `o${event.date}`);
    addField(event.updatedAt);
  }
  return `${events.length}:${(hash >>> 0).toString(36)}`;
}
