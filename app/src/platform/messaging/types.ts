import type { DueItem } from '../../ui/calendar/assignment';
import { FETCH_HOOK, KING_LMS_HOOK, MSG } from '../../contract/messages';

/** fetch フック → オーバーレイ（捕捉データ） */
export type CapturedPortalMessage = {
  type: (typeof MSG)[keyof typeof MSG];
  source: typeof FETCH_HOOK.source;
  url: string;
  data: unknown;
};

/** オーバーレイ → フック（replay） */
export type ReplayRequestMessage = {
  type: typeof FETCH_HOOK.replayRequest;
};

/** オーバーレイ → フック（pageFetch） */
export type PageFetchRequestMessage = {
  type: typeof FETCH_HOOK.pageFetch;
  url: string;
};

/** オーバーレイ → フック（認証付き API） */
export type PortalApiRequestMessage = {
  type: typeof FETCH_HOOK.portalApiRequest;
  id: string;
  method: 'GET' | 'POST';
  url: string;
  body?: string;
};

/** フック → オーバーレイ（portalApiRequest 応答） */
export type PortalApiResponseMessage = {
  type: typeof FETCH_HOOK.portalApiResponse;
  source: typeof FETCH_HOOK.source;
  id: string;
  ok: boolean;
  status: number;
  json: unknown;
};

/** オーバーレイ → フック（logoff） */
export type LogoffTriggerMessage = {
  type: typeof FETCH_HOOK.logoffTrigger;
};

/** King LMS hooks → bridge（コース一覧） */
export type KingLmsCoursesMessage = {
  type: typeof KING_LMS_HOOK.coursesPostType;
  source: typeof KING_LMS_HOOK.source;
  courses: Array<{ displayName: string | null; externalAccessUrl: string | null }>;
};

/** King LMS hooks → bridge（課題一覧） */
export type KingLmsAssignmentDueMessage = {
  type: typeof KING_LMS_HOOK.assignmentDuePostType;
  source: typeof KING_LMS_HOOK.source;
  items: DueItem[];
  capturedAt: number;
  captureState?: 'error';
  assignmentSyncNoOp?: boolean;
};

/** King LMS hooks → bridge（課題取得の進み具合。取得中オーバーレイの段階表示に使う） */
export type KingLmsAssignmentProgressMessage = {
  type: typeof KING_LMS_HOOK.assignmentProgressType;
  source: typeof KING_LMS_HOOK.source;
  step: 'calendar' | 'status';
  done?: number;
  total?: number;
};

/** King LMS hooks → bridge（同期中断） */
export type KingLmsSyncAbortMessage = {
  type: typeof KING_LMS_HOOK.syncAbortType;
  source: typeof KING_LMS_HOOK.source;
  reason?: string;
};

export type PageMessage =
  | CapturedPortalMessage
  | ReplayRequestMessage
  | PageFetchRequestMessage
  | PortalApiRequestMessage
  | LogoffTriggerMessage
  | KingLmsCoursesMessage
  | KingLmsAssignmentDueMessage
  | KingLmsAssignmentProgressMessage
  | KingLmsSyncAbortMessage;

const MSG_TYPES = new Set<string>(Object.values(MSG));
const FETCH_TO_HOOK = new Set<string>([
  FETCH_HOOK.replayRequest,
  FETCH_HOOK.pageFetch,
  FETCH_HOOK.portalApiRequest,
  FETCH_HOOK.logoffTrigger,
]);
const KING_LMS_TYPES = new Set<string>([
  KING_LMS_HOOK.coursesPostType,
  KING_LMS_HOOK.assignmentDuePostType,
  KING_LMS_HOOK.assignmentProgressType,
  KING_LMS_HOOK.syncAbortType,
]);

export function isPageMessage(data: unknown): data is PageMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  const type = msg.type;
  if (typeof type !== 'string') return false;

  if (MSG_TYPES.has(type)) {
    return msg.source === FETCH_HOOK.source && typeof msg.url === 'string';
  }
  if (FETCH_TO_HOOK.has(type)) {
    if (type === FETCH_HOOK.pageFetch) return typeof msg.url === 'string';
    if (type === FETCH_HOOK.portalApiRequest) {
      return typeof msg.id === 'string' && typeof msg.url === 'string';
    }
    return true;
  }
  if (KING_LMS_TYPES.has(type)) return isKingLmsMessageBody(type, msg);
  return false;
}

function isKingLmsMessageBody(type: string, msg: Record<string, unknown>): boolean {
  if (msg.source !== KING_LMS_HOOK.source) return false;
  if (type === KING_LMS_HOOK.coursesPostType) return Array.isArray(msg.courses);
  if (type === KING_LMS_HOOK.assignmentDuePostType) return Array.isArray(msg.items);
  if (type === KING_LMS_HOOK.assignmentProgressType) {
    return msg.step === 'calendar' || msg.step === 'status';
  }
  return true;
}
