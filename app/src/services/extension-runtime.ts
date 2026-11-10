import { EXTENSION_ENABLED_URL } from '../contract/origins';
import { SK } from '../contract/storage-keys';
import { chromeStorageClient } from '../platform/storage/chrome-storage-client';
import { KING_LMS_SYNC_DOM, PORTAL_DOM } from '../contract/dom';
import { removePortalBackdrop } from '../domain/themes';
import { teardownHome2Overlay } from './home2-host';
import {
  hideExtensionDisabledNotice,
  showExtensionDisabledNotice,
} from './extension-disabled-notice';

type ExtensionEnabledResponse = { enabled?: unknown };

/** サーバー kill switch 検知後、同一タブで拡張を止める sessionStorage キー */
const REMOTE_KILL_SWITCH_SESSION_KEY = 'kcgExtensionRemoteDisabled';
const OPERATIONAL_WATCH_DATASET_KEY = 'kcgExtRuntimeWatch';
/** 利用者がオフにしたことの、ページ側（オリジンごと）の写し。MAIN ワールドからも同期的に読める */
const USER_DISABLED_LOCAL_KEY = 'kcgExtensionUserDisabled';
const USER_WATCH_DATASET_KEY = 'kcgExtUserWatch';

function readRemoteKillSwitchFlag(): boolean {
  try {
    return sessionStorage.getItem(REMOTE_KILL_SWITCH_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function writeRemoteKillSwitchFlag(blocked: boolean): void {
  try {
    if (blocked) sessionStorage.setItem(REMOTE_KILL_SWITCH_SESSION_KEY, '1');
    else sessionStorage.removeItem(REMOTE_KILL_SWITCH_SESSION_KEY);
  } catch {
    // sessionStorage 不可時は fail-open のまま
  }
}

/** 直前の kill switch リロード後、拡張を起動しない */
export function isExtensionBlockedByRemoteKillSwitch(): boolean {
  return readRemoteKillSwitchFlag();
}

function readUserDisabledFlag(): boolean {
  try {
    return localStorage.getItem(USER_DISABLED_LOCAL_KEY) === '1';
  } catch {
    return false;
  }
}

/** 写しを書き、書けたか（読み直して一致したか）を返す。書けない環境で再読み込みを繰り返さないため */
function writeUserDisabledFlag(disabled: boolean): boolean {
  try {
    if (disabled) localStorage.setItem(USER_DISABLED_LOCAL_KEY, '1');
    else localStorage.removeItem(USER_DISABLED_LOCAL_KEY);
  } catch {
    return false;
  }
  return readUserDisabledFlag() === disabled;
}

/** 利用者がツールバーのメニューでオフにしている */
export function isExtensionDisabledByUser(): boolean {
  return readUserDisabledFlag();
}

/** サーバーの停止か利用者のオフで、このページでは拡張を起動しない */
export function isExtensionBlocked(): boolean {
  return readRemoteKillSwitchFlag() || readUserDisabledFlag();
}

function applyUserDisabled(disabled: boolean): void {
  if (readUserDisabledFlag() === disabled) return;
  if (writeUserDisabledFlag(disabled)) location.reload();
}

/**
 * 拡張の storage（オン／オフの正）とページ側の写しを突き合わせ、ずれていたら直して再読み込みする。
 * 開いているあいだに切り替えられたときも追従する。storage が無い MAIN ワールドでは何もしない。
 */
function startUserToggleWatch(): void {
  const hasStorage =
    (typeof browser !== 'undefined' && Boolean(browser.storage?.local)) ||
    (typeof chrome !== 'undefined' && Boolean(chrome.storage?.local));
  if (!hasStorage || document.documentElement.dataset[USER_WATCH_DATASET_KEY]) return;
  document.documentElement.dataset[USER_WATCH_DATASET_KEY] = '1';
  void chromeStorageClient
    .get(SK.extensionUserDisabled)
    .then((data) => applyUserDisabled(data[SK.extensionUserDisabled] === true));
  chromeStorageClient.onChanged((changes, area) => {
    if (area !== 'local' || !(SK.extensionUserDisabled in changes)) return;
    applyUserDisabled(changes[SK.extensionUserDisabled]?.newValue === true);
  });
}

/** 取得失敗時は直前の状態を維持する。未停止のタブでは従来どおり動作する。 */
export async function isExtensionOperationallyEnabled(): Promise<boolean> {
  try {
    const response = await fetch(EXTENSION_ENABLED_URL, { cache: 'no-store' });
    if (!response.ok) return !readRemoteKillSwitchFlag();
    const payload = (await response.json()) as ExtensionEnabledResponse;
    return typeof payload.enabled === 'boolean' ? payload.enabled : !readRemoteKillSwitchFlag();
  } catch {
    return !readRemoteKillSwitchFlag();
  }
}

function syncDisabledNotice(): void {
  if (readRemoteKillSwitchFlag()) showExtensionDisabledNotice();
  else hideExtensionDisabledNotice();
}

/**
 * kill switch を非同期で確認する。ブートは待たない。
 * OFF 検知時は sessionStorage に記録してリロード（次回以降は拡張を差し込まない）。
 * ブロック中に ON に戻ったらフラグを消してリロードする。
 */
export function startExtensionOperationalWatch(): void {
  startUserToggleWatch();
  syncDisabledNotice();
  if (document.documentElement.dataset[OPERATIONAL_WATCH_DATASET_KEY]) return;
  document.documentElement.dataset[OPERATIONAL_WATCH_DATASET_KEY] = '1';
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', syncDisabledNotice, { once: true });
  }

  void (async () => {
    const enabled = await isExtensionOperationallyEnabled();
    if (!enabled) {
      if (!readRemoteKillSwitchFlag()) {
        writeRemoteKillSwitchFlag(true);
        syncDisabledNotice();
        location.reload();
      }
      return;
    }
    if (readRemoteKillSwitchFlag()) {
      writeRemoteKillSwitchFlag(false);
      syncDisabledNotice();
      location.reload();
    }
  })();
}

/** 拡張 UI / フックが差し込んだ DOM・背景を可能な限り除去する。 */
export function teardownExtensionUi(): void {
  removePortalBackdrop();
  teardownHome2Overlay();
  document.getElementById(PORTAL_DOM.bootCover)?.remove();
  document.getElementById(PORTAL_DOM.overlayRoot)?.remove();
  document.getElementById(KING_LMS_SYNC_DOM.overlay)?.remove();
  document.getElementById(KING_LMS_SYNC_DOM.style)?.remove();
  document.documentElement.classList.remove('kcg-portal-surface');
  document.body?.classList.remove('kcg-portal-surface');
  document.documentElement.classList.remove(KING_LMS_SYNC_DOM.scrollLockClass);
  delete document.documentElement.dataset.cplanOverlayDisabled;
}
