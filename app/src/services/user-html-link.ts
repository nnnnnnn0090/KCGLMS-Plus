/**
 * ポータル Profile の「マイリンク」と同期する API ラッパー。
 *
 * GET  /portal/api/UserHtmlLink/Me/
 * POST /portal/api/UserProfile/UpUserLink/
 */

import { MSG, FETCH_HOOK } from '../contract/messages';
import { urls, pageFetch } from '../lib/api';
import { withWebLock } from '../lib/web-lock';
import { portalApiRequest } from './portal-api-client';

/** マイリンクを書き換える処理（通常リンクの編集・設定同期）を全タブで直列化するロック */
const PORTAL_USER_LINKS_LOCK = 'kcglms-portal-user-links';

export type PortalUserLinksFailure = 'signed-out' | 'network' | 'rejected';

export class PortalUserLinksError extends Error {
  constructor(
    message: string,
    readonly reason: PortalUserLinksFailure,
    /** HTTP ステータス（応答がなければ 0） */
    readonly status = 0,
  ) {
    super(message);
    this.name = 'PortalUserLinksError';
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failureFromStatus(status: number, rejectedOtherwise: boolean): PortalUserLinksFailure {
  if (status === 401 || status === 403) return 'signed-out';
  if (status === 0 || status >= 500) return 'network';
  return rejectedOtherwise ? 'rejected' : 'network';
}

export interface PortalUserLink {
  id: string;
  version: number | string;
  linkNo: number;
  midashi: string;
  url: string;
  biko: string;
  order: number;
  delFlg: boolean;
}

export interface PortalUserLinkSaveResponse {
  userMessage?: string;
  fullMessage?: string;
  sysException?: string;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

export function parsePortalUserLink(x: unknown): PortalUserLink | null {
  if (!isRecord(x)) return null;
  if (typeof x.midashi !== 'string' || typeof x.url !== 'string') return null;
  const linkNo = typeof x.linkNo === 'number' ? x.linkNo : Number(x.linkNo);
  if (!Number.isFinite(linkNo)) return null;
  const order = typeof x.order === 'number' ? x.order : Number(x.order ?? 0);
  return {
    id: String(x.id ?? ''),
    version: typeof x.version === 'number' || typeof x.version === 'string' ? x.version : '',
    linkNo,
    midashi: x.midashi.trim(),
    url: x.url.trim(),
    biko: typeof x.biko === 'string' ? x.biko : '',
    order: Number.isFinite(order) ? order : 0,
    delFlg: x.delFlg === true,
  };
}

export function parsePortalUserLinks(raw: unknown): PortalUserLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parsePortalUserLink).filter((x): x is PortalUserLink => x !== null);
}

export function activePortalUserLinks(links: readonly PortalUserLink[]): PortalUserLink[] {
  return links.filter((link) => !link.delFlg);
}

export function nextPortalLinkNo(links: readonly PortalUserLink[]): number {
  let max = 0;
  for (const link of links) {
    if (link.linkNo > max) max = link.linkNo;
  }
  return max + 1;
}

/** Profile 画面と同じく、新規で delFlg かつ id 空の行は送らない */
export function buildPortalUserLinkSavePayload(links: readonly PortalUserLink[]): PortalUserLink[] {
  return links.filter((link) => !(link.delFlg && !link.id));
}

export function createPortalUserLinkDraft(
  links: readonly PortalUserLink[],
  midashi: string,
  url: string,
  biko = '',
): PortalUserLink {
  return {
    id: '',
    version: '',
    delFlg: false,
    linkNo: nextPortalLinkNo(links),
    midashi,
    url,
    biko,
    order: 0,
  };
}

export async function fetchPortalUserLinks(): Promise<PortalUserLink[]> {
  let res;
  try {
    res = await portalApiRequest<unknown>('GET', urls.userHtmlLinkMe());
  } catch (error) {
    throw new PortalUserLinksError(`load: ${describeError(error)}`, 'network');
  }
  if (!res.ok) {
    throw new PortalUserLinksError(
      `load: HTTP ${res.status}`,
      failureFromStatus(res.status, false),
      res.status,
    );
  }
  // ログイン切れではログイン画面などが返り、配列にならない。
  if (!Array.isArray(res.json)) {
    const kind = res.json === null ? 'empty or not JSON' : typeof res.json;
    throw new PortalUserLinksError(
      `load: HTTP ${res.status}, response is ${kind}`,
      'signed-out',
      res.status,
    );
  }
  return parsePortalUserLinks(res.json);
}

export async function savePortalUserLinks(links: readonly PortalUserLink[]): Promise<void> {
  const payload = buildPortalUserLinkSavePayload(links);
  let res;
  try {
    res = await portalApiRequest<PortalUserLinkSaveResponse>(
      'POST',
      urls.updateUserHtmlLink(),
      payload,
    );
  } catch (error) {
    throw new PortalUserLinksError(`save: ${describeError(error)}`, 'network');
  }
  if (!res.ok) {
    const message = res.json?.userMessage || res.json?.fullMessage || '';
    throw new PortalUserLinksError(
      `save: HTTP ${res.status}${message ? ` ${message}` : ''}`,
      failureFromStatus(res.status, true),
      res.status,
    );
  }
}

/** マイリンクの読み書きを、全タブで1つずつ実行する。 */
export function withPortalUserLinksLock<T>(task: () => Promise<T>): Promise<T> {
  return withWebLock(PORTAL_USER_LINKS_LOCK, task);
}

/**
 * 最新のマイリンクを取得し直してから変更を加えて保存する。
 * 画面が持っている古い一覧で上書きしないため、変更は必ずこの関数を通す。
 */
export async function mutatePortalUserLinks(
  mutate: (latest: PortalUserLink[]) => PortalUserLink[],
): Promise<PortalUserLink[]> {
  return withPortalUserLinksLock(async () => {
    const latest = await fetchPortalUserLinks();
    const next = mutate(latest);
    await savePortalUserLinks(next);
    return next;
  });
}

export function refreshPortalUserLinks(): void {
  pageFetch(urls.userHtmlLink());
  pageFetch(urls.userHtmlLinkMe());
  void refreshPortalUserLinksDirect();
}

async function refreshPortalUserLinksDirect(): Promise<void> {
  try {
    const { pushHomePortalMessage } = await import('./portal-inbox');
    const [homeRes, meRes] = await Promise.all([
      portalApiRequest<unknown>('GET', urls.userHtmlLink()),
      portalApiRequest<unknown>('GET', urls.userHtmlLinkMe()),
    ]);
    if (homeRes.ok && Array.isArray(homeRes.json)) {
      pushHomePortalMessage({
        type: MSG.userHtmlLink,
        source: FETCH_HOOK.source,
        items: homeRes.json,
      });
    }
    if (meRes.ok && Array.isArray(meRes.json)) {
      pushHomePortalMessage({
        type: MSG.userHtmlLinkMe,
        source: FETCH_HOOK.source,
        items: meRes.json,
      });
    }
  } catch {
    /* 未ログイン等は pageFetch / replay に任せる */
  }
}

export async function addPortalUserLink(midashi: string, url: string): Promise<PortalUserLink[]> {
  const next = await mutatePortalUserLinks((latest) => [
    ...latest,
    createPortalUserLinkDraft(latest, midashi, url),
  ]);
  refreshPortalUserLinks();
  return next;
}

export async function deletePortalUserLink(id: string): Promise<PortalUserLink[]> {
  const next = await mutatePortalUserLinks((latest) =>
    latest.map((link) => (link.id === id ? { ...link, delFlg: true } : link)),
  );
  refreshPortalUserLinks();
  return next;
}

/** 拡張ローカル custom[] をポータルへ移行する */
export async function migrateLocalCustomLinks(
  custom: ReadonlyArray<{ midashi: string; url: string }>,
): Promise<void> {
  if (custom.length === 0) return;
  await mutatePortalUserLinks((latest) => {
    let links = latest;
    for (const item of custom) {
      const midashi = item.midashi.trim();
      const url = item.url.trim();
      if (!midashi || !url) continue;
      links = [...links, createPortalUserLinkDraft(links, midashi, url)];
    }
    return links;
  });
  refreshPortalUserLinks();
}
