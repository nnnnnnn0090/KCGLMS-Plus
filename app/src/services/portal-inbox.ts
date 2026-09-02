/**
 * page-bus 購読 + replay 要求 + MSG 別ディスパッチ（React 外の購読ストア）。
 */

import { useSyncExternalStore } from 'react';
import { FETCH_HOOK } from '../contract/messages';
import { postReplayRequest } from '../platform/messaging/page-bus';
import type { PortalCapturedMessage } from '../shared/types';
import { applyHomePortalMessage, type HomePortalInboxState } from '../lib/portal-messages-home';

export type { PortalCapturedMessage };

type PortalMessageHandler = (msg: PortalCapturedMessage) => void;

export interface PortalInboxSubscriptionOptions {
  /** 指定時はこれらの type のみ handler を呼ぶ（例: 単一カレンダーパネル） */
  msgTypes?: readonly string[];
}

/** 同一オリジンかつ `portal-hooks` が付与した `source` であることを確認します。 */
function isTrustedPortalMessage(e: MessageEvent): boolean {
  if (e.origin !== location.origin) return false;
  if (!e.data?.type) return false;
  if (e.data.type === FETCH_HOOK.replayRequest) return false;
  return e.data.source === FETCH_HOOK.source;
}

type Subscription = {
  handler: PortalMessageHandler;
  msgTypes?: readonly string[];
};

let listenerInstalled = false;
const subscriptions = new Set<Subscription>();

function dispatchPortalMessage(msg: PortalCapturedMessage): void {
  for (const sub of subscriptions) {
    const types = sub.msgTypes;
    if (types && !types.includes(String(msg.type))) continue;
    sub.handler(msg);
  }
}

function ensurePortalInboxListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  window.addEventListener('message', (e: MessageEvent) => {
    if (!isTrustedPortalMessage(e)) return;
    dispatchPortalMessage(e.data as PortalCapturedMessage);
  });
}

/** キャプチャ済みメッセージの再送を要求する */
export function requestPortalInboxReplay(): void {
  postReplayRequest();
}

/** portal-hooks からの postMessage を購読する（React 外） */
export function subscribePortalInbox(
  handler: PortalMessageHandler,
  options?: PortalInboxSubscriptionOptions,
): () => void {
  ensurePortalInboxListener();
  const sub: Subscription = { handler, msgTypes: options?.msgTypes };
  const wasEmpty = subscriptions.size === 0;
  subscriptions.add(sub);
  if (wasEmpty) requestPortalInboxReplay();
  return () => {
    subscriptions.delete(sub);
  };
}

// ─── ホーム受信箱（useSyncExternalStore） ─────────────────────────────────

const initialHomeInbox: HomePortalInboxState = {
  kinoData: null,
  kogiNews: [],
  newTopicsItems: [],
  linkItems: [],
  userLinkRecords: [],
};

let homeInboxState = initialHomeInbox;
const homeInboxListeners = new Set<() => void>();
let homeInboxSubscribed = false;

function notifyHomeInboxListeners(): void {
  for (const listener of homeInboxListeners) listener();
}

function ensureHomeInboxSubscription(): void {
  if (homeInboxSubscribed) return;
  homeInboxSubscribed = true;
  subscribePortalInbox((msg) => {
    const next = applyHomePortalMessage(homeInboxState, msg);
    if (next !== homeInboxState) {
      homeInboxState = next;
      notifyHomeInboxListeners();
    }
  });
}

export function subscribeHomePortalInbox(onStoreChange: () => void): () => void {
  ensureHomeInboxSubscription();
  homeInboxListeners.add(onStoreChange);
  return () => homeInboxListeners.delete(onStoreChange);
}

export function getHomePortalInboxSnapshot(): HomePortalInboxState {
  return homeInboxState;
}

export function useHomePortalInbox(): HomePortalInboxState {
  return useSyncExternalStore(subscribeHomePortalInbox, getHomePortalInboxSnapshot);
}

/** pageFetch / replay 以外からホーム受信箱へ反映する（ショートカット再取得など） */
export function pushHomePortalMessage(msg: PortalCapturedMessage): void {
  ensureHomeInboxSubscription();
  const next = applyHomePortalMessage(homeInboxState, msg);
  if (next !== homeInboxState) {
    homeInboxState = next;
    notifyHomeInboxListeners();
  }
}
