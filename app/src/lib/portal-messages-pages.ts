/**
 * ホーム以外の各ページ向けに、`portal-hooks` から届く `postMessage` を解釈して状態を更新します。
 */

import { MSG } from '../shared/constants';
import type { NewsListItem, PortalCapturedMessage } from '../shared/types';
import {
  isKinoMessagePayload,
  isNewsListItem,
  isRecord,
  type KinoMessagePayload,
} from './portal-messages-home';

// ─── 共通ユーティリティ ───────────────────────────────────────────────────────

/** 複数キー候補のうち最初に非空（trim 後）の値を文字列で返す */
export function pick(obj: Record<string, unknown> | null, keys: string[]): string {
  if (!obj) return '';
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]);
  }
  return '';
}

/** `key` と先頭 `_` のペア（ポータル JSON の整列用）のうち、最初に非空の値がある方を返す */
export function pickUnderscore(obj: Record<string, unknown> | null, key: string): string {
  return pick(obj, [key, `_${key}`]);
}

// ─── お知らせ一覧 ─────────────────────────────────────────────────────────

export type { NewsListItem } from '../shared/types';

export interface NewsListPortalState {
  kinoData: KinoMessagePayload | null;
  raw: NewsListItem[] | null;
}

export function nendoFromDeliveredNewsUrl(href: string): string {
  try {
    const m = new URL(href, location.origin).pathname.match(/\/DeliveredNews\/Nendo\/([^/]+)/);
    return m ? m[1]! : '';
  } catch {
    return '';
  }
}

/** お知らせ一覧: `pendingNendo` で年度リクエストとレスポンスを突き合わせる */
export function reduceNewsListPortalMessage(
  prev: NewsListPortalState,
  msg: PortalCapturedMessage,
  pendingNendo: { current: string | null },
): NewsListPortalState {
  if (msg.type === MSG.kinoMessage && msg.data !== undefined && isKinoMessagePayload(msg.data)) {
    return { ...prev, kinoData: msg.data };
  }
  if (msg.type === MSG.deliveredNews) {
    const reqUrl = String(msg.requestUrl ?? '');
    const respNendo = nendoFromDeliveredNewsUrl(reqUrl);
    if (respNendo && respNendo !== pendingNendo.current) return prev;
    pendingNendo.current = null;
    return {
      ...prev,
      raw: Array.isArray(msg.items) ? msg.items.filter(isNewsListItem) : [],
    };
  }
  return prev;
}

// ─── お知らせ詳細 ─────────────────────────────────────────────────────────

export interface NewsDetailPayload {
  id?: unknown;
  title?: string;
  newsDate?: string;
  sender?: string;
  category?: string;
  importanceCd?: string;
  naiyo?: string;
  attachmentFiles?: unknown[];
}

export function reduceNewsDetailPortalMessage(
  prev: NewsDetailPayload | null,
  msg: PortalCapturedMessage,
  newsDetailId: string,
): NewsDetailPayload | null {
  if (msg.type !== MSG.deliveredNewsDetail) return prev;
  const d = msg.data;
  if (!isRecord(d)) return prev;
  if (String(d.id ?? '') !== String(newsDetailId)) return prev;
  return d as NewsDetailPayload;
}

// ─── アンケート一覧 ─────────────────────────────────────────────────────────

export type SurveyRow = Record<string, unknown>;

export interface SurveyPortalState {
  kinoData: KinoMessagePayload | null;
  raw: SurveyRow[] | null;
}

export function reduceSurveyPortalMessage(
  prev: SurveyPortalState,
  msg: PortalCapturedMessage,
): SurveyPortalState {
  if (msg.type === MSG.kinoMessage && msg.data !== undefined && isKinoMessagePayload(msg.data)) {
    return { ...prev, kinoData: msg.data };
  }
  if (msg.type === MSG.questionnaireInfo && Array.isArray(msg.items)) {
    return { ...prev, raw: msg.items.filter(isRecord) };
  }
  return prev;
}

// ─── 休講・補講・教室変更 ─────────────────────────────────────────────────

export type KyukoRow = Record<string, unknown>;

export interface KyukoPortalState {
  kinoData: KinoMessagePayload | null;
  kkRaw: KyukoRow[] | null;
  hkRaw: KyukoRow[] | null;
  kcRaw: KyukoRow[] | null;
  rishuToken: string;
  rishuReady: boolean;
}

function firstRishuToken(items: KyukoRow[]): string {
  for (const row of items) {
    const uid = row?.userId != null ? String(row.userId).trim() : '';
    if (uid) return `${uid}_isRishu`;
  }
  return '';
}

function withRishuBootstrap(prev: KyukoPortalState, items: KyukoRow[]): Partial<KyukoPortalState> {
  if (prev.rishuReady) return {};
  const tok = firstRishuToken(items);
  if (!tok) return {};
  return { rishuToken: tok, rishuReady: true };
}

export function reduceKyukoPortalMessage(
  prev: KyukoPortalState,
  msg: PortalCapturedMessage,
): KyukoPortalState {
  if (msg.type === MSG.kinoMessage && msg.data !== undefined && isKinoMessagePayload(msg.data)) {
    return { ...prev, kinoData: msg.data };
  }
  if (msg.type === MSG.kyukoInfo && Array.isArray(msg.items)) {
    const items = msg.items.filter(isRecord);
    return { ...prev, kkRaw: items, ...withRishuBootstrap(prev, items) };
  }
  if (msg.type === MSG.hokoInfo && Array.isArray(msg.items)) {
    const items = msg.items.filter(isRecord);
    return { ...prev, hkRaw: items, ...withRishuBootstrap(prev, items) };
  }
  if (msg.type === MSG.kyoshitsuChange && Array.isArray(msg.items)) {
    const items = msg.items.filter(isRecord);
    return { ...prev, kcRaw: items, ...withRishuBootstrap(prev, items) };
  }
  return prev;
}

export const initialKyukoPortalState = (): KyukoPortalState => ({
  kinoData: null,
  kkRaw: null,
  hkRaw: null,
  kcRaw: null,
  rishuToken: '',
  rishuReady: false,
});
