/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SK } from '../contract/storage-keys';
import { isExtensionBlocked, startExtensionOperationalWatch } from './extension-runtime';

const USER_FLAG = 'kcgExtensionUserDisabled';

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

function stubBrowser(initial: Record<string, unknown>) {
  const listeners: Listener[] = [];
  vi.stubGlobal('browser', {
    storage: {
      local: { get: vi.fn(async () => initial) },
      onChanged: {
        addListener: (l: Listener) => listeners.push(l),
        removeListener: vi.fn(),
      },
    },
  });
  return (disabled: boolean) =>
    listeners.forEach((l) => l({ [SK.extensionUserDisabled]: { newValue: disabled } }, 'local'));
}

describe('extension-runtime user toggle', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete document.documentElement.dataset.kcgExtRuntimeWatch;
    delete document.documentElement.dataset.kcgExtUserWatch;
    reload = vi.fn();
    vi.stubGlobal('location', { ...location, reload });
    // サーバー側は動いている扱い
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true }) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    delete document.documentElement.dataset.kcgExtUserWatch;
  });

  it('ページ側の写しがあれば同期的に止める', () => {
    expect(isExtensionBlocked()).toBe(false);
    localStorage.setItem(USER_FLAG, '1');
    expect(isExtensionBlocked()).toBe(true);
  });

  it('メニューでオフにされていたら写しを作って読み込み直す', async () => {
    stubBrowser({ [SK.extensionUserDisabled]: true });
    startExtensionOperationalWatch();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(localStorage.getItem(USER_FLAG)).toBe('1');
  });

  it('オンに戻されていたら写しを消して読み込み直す', async () => {
    localStorage.setItem(USER_FLAG, '1');
    stubBrowser({});
    startExtensionOperationalWatch();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(localStorage.getItem(USER_FLAG)).toBeNull();
  });

  it('写しと一致していれば読み込み直さない', async () => {
    stubBrowser({});
    startExtensionOperationalWatch();
    await new Promise((r) => setTimeout(r, 10));
    expect(reload).not.toHaveBeenCalled();
  });

  it('開いているあいだに切り替えられたら追従する', async () => {
    const change = stubBrowser({});
    startExtensionOperationalWatch();
    await new Promise((r) => setTimeout(r, 10));
    change(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(localStorage.getItem(USER_FLAG)).toBe('1');
  });

  it('メンテナンスのお知らせはオフでは出さない', async () => {
    localStorage.setItem(USER_FLAG, '1');
    stubBrowser({ [SK.extensionUserDisabled]: true });
    startExtensionOperationalWatch();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.getElementById('kcglms-remote-disabled-notice')).toBeNull();
  });
});
