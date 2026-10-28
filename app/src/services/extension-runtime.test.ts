/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTENSION_ENABLED_URL } from '../contract/origins';
import {
  isExtensionBlockedByRemoteKillSwitch,
  isExtensionOperationallyEnabled,
  startExtensionOperationalWatch,
} from './extension-runtime';

const REMOTE_KILL_SWITCH_SESSION_KEY = 'kcgExtensionRemoteDisabled';
const NOTICE_ID = 'kcglms-remote-disabled-notice';

describe('extension-runtime', () => {
  beforeEach(() => {
    sessionStorage.clear();
    delete document.documentElement.dataset.kcgExtRuntimeWatch;
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    delete document.documentElement.dataset.kcgExtRuntimeWatch;
    document.body.replaceChildren();
  });

  it('returns true when enabled is not false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ enabled: true }),
      }),
    );

    await expect(isExtensionOperationallyEnabled()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(EXTENSION_ENABLED_URL, { cache: 'no-store' });
  });

  it('returns false when enabled is false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ enabled: false }),
      }),
    );

    await expect(isExtensionOperationallyEnabled()).resolves.toBe(false);
  });

  it('fail-opens when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(isExtensionOperationallyEnabled()).resolves.toBe(true);
  });

  it('marks session and reloads when kill switch turns off asynchronously', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...location, reload });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ enabled: false }),
      }),
    );

    startExtensionOperationalWatch();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem(REMOTE_KILL_SWITCH_SESSION_KEY)).toBe('1');
    expect(isExtensionBlockedByRemoteKillSwitch()).toBe(true);
    expect(document.getElementById(NOTICE_ID)?.shadowRoot?.textContent).toContain(
      'KCGLMS+ はメンテナンス中です',
    );
  });

  it('clears session and reloads when kill switch turns back on while blocked', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...location, reload });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ enabled: true }),
      }),
    );
    sessionStorage.setItem(REMOTE_KILL_SWITCH_SESSION_KEY, '1');

    startExtensionOperationalWatch();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem(REMOTE_KILL_SWITCH_SESSION_KEY)).toBeNull();
    expect(isExtensionBlockedByRemoteKillSwitch()).toBe(false);
    expect(document.getElementById(NOTICE_ID)).toBeNull();
  });

  it('shows one persistent notice before a blocked tab receives the server response', () => {
    sessionStorage.setItem(REMOTE_KILL_SWITCH_SESSION_KEY, '1');
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    startExtensionOperationalWatch();
    startExtensionOperationalWatch();

    const notice = document.getElementById(NOTICE_ID);
    expect(document.querySelectorAll(`#${NOTICE_ID}`)).toHaveLength(1);
    expect(notice?.getAttribute('role')).toBe('status');
    expect(notice?.shadowRoot?.querySelector('button')).toBeNull();
    expect(notice?.shadowRoot?.textContent).toContain('近日中に再開予定です');
    expect(notice?.shadowRoot?.textContent).toContain('通常の画面は引き続きご利用いただけます');
  });

  it.each([
    ['network failure', () => Promise.reject(new Error('offline'))],
    ['HTTP failure', () => Promise.resolve({ ok: false })],
    ['missing status', () => Promise.resolve({ ok: true, json: async () => ({}) })],
    ['invalid JSON', () => Promise.resolve({ ok: true, json: async () => null })],
  ])('keeps a blocked tab disabled after %s', async (_label, response) => {
    const reload = vi.fn();
    sessionStorage.setItem(REMOTE_KILL_SWITCH_SESSION_KEY, '1');
    vi.stubGlobal('location', { ...location, reload });
    vi.stubGlobal('fetch', vi.fn(response));

    startExtensionOperationalWatch();
    await expect(isExtensionOperationallyEnabled()).resolves.toBe(false);

    expect(isExtensionBlockedByRemoteKillSwitch()).toBe(true);
    expect(document.getElementById(NOTICE_ID)).not.toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('waits for the body when a blocked tab starts at document_start', () => {
    const body = document.body;
    body.remove();
    sessionStorage.setItem(REMOTE_KILL_SWITCH_SESSION_KEY, '1');
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    try {
      startExtensionOperationalWatch();
      expect(document.getElementById(NOTICE_ID)).toBeNull();
    } finally {
      document.documentElement.append(body);
    }
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(document.getElementById(NOTICE_ID)).not.toBeNull();
  });

  it('does not show the stop notice for a normally enabled tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true }) }),
    );

    startExtensionOperationalWatch();
    await expect(isExtensionOperationallyEnabled()).resolves.toBe(true);

    expect(document.getElementById(NOTICE_ID)).toBeNull();
  });

  it('starts operational watch only once', async () => {
    const reload = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false }),
    });
    vi.stubGlobal('location', { ...location, reload });
    vi.stubGlobal('fetch', fetchMock);

    startExtensionOperationalWatch();
    startExtensionOperationalWatch();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
