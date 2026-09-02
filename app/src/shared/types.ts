/**
 * 拡張機能全体で共有する型定義。
 * postMessage の判別可能 union と、ホームのショートカットリンク設定型を含む。
 */

import { MSG } from './constants';
import type { MsgType } from './constants';

type WithSource = { source?: string };

export type PortalCapturedMessage =
  | (WithSource & { type: typeof MSG.kinoMessage; data?: unknown })
  | (WithSource & { type: typeof MSG.kogiCalendar; items: unknown[]; requestUrl?: string })
  | (WithSource & { type: typeof MSG.hoshuCalendar; items: unknown[]; requestUrl?: string })
  | (WithSource & { type: typeof MSG.campusCalendar; items: unknown[]; requestUrl?: string })
  | (WithSource & { type: typeof MSG.kyukoInfo; items: unknown[]; requestUrl?: string })
  | (WithSource & { type: typeof MSG.hokoInfo; items: unknown[]; requestUrl?: string })
  | (WithSource & { type: typeof MSG.kyoshitsuChange; items: unknown[]; requestUrl?: string })
  | (WithSource & { type: typeof MSG.questionnaireInfo; items: unknown[]; requestUrl?: string })
  | (WithSource & { type: typeof MSG.deliveredNewsDetail; data?: unknown })
  | (WithSource & { type: typeof MSG.deliveredNews; items: unknown[]; requestUrl?: string })
  | (WithSource & { type: typeof MSG.newTopics; items: unknown[] })
  | (WithSource & { type: typeof MSG.kogiNews; items: unknown[] })
  | (WithSource & { type: typeof MSG.userHtmlLink; items: unknown[] })
  | (WithSource & { type: typeof MSG.userHtmlLinkMe; items: unknown[] })
  | UnknownPortalCaptured;

/** 将来の type 追加やフック拡張用フォールバック */
export interface UnknownPortalCaptured {
  source?: string;
  type: MsgType | string;
  items?: unknown[];
  data?: unknown;
  requestUrl?: string;
}

// ─── ショートカットリンク ─────────────────────────────────────────────────────

/** ホームのショートカットリンク（カスタム追加分） */
export interface CustomLink {
  id: string;
  midashi: string;
  url: string;
}

/** ショートカットリンクのストレージ形式 */
export interface LinkConfig {
  order: string[];
  hidden: string[];
  custom: CustomLink[];
}

// ─── お知らせ一覧行（KogiNews / NewTopics / DeliveredNews 等で共通）────────

/** ポータル API のお知らせ一覧行（キーは API 差分を吸収するため緩め） */
export interface NewsListItem {
  id?: unknown;
  title?: string;
  newsDate?: string;
  sender?: string;
  category?: string;
  categoryCd?: string;
  importanceCd?: string;
  importance?: string;
  readFlg?: string | number;
  newFlg?: string | number;
}
