/**
 * みんなの活動ドロワー（拡張側の殻）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BRIDGE_MESSAGE } from '@community-boundary/bridge';
import { COMMUNITY_BOUNDARY_TIMING } from '@community-boundary/timing';
import type { AppLanguage } from '../../../i18n/messages';
import { messagesForLanguage } from '../../../i18n/messages';
import { PORTAL_DOM } from '../../../shared/constants';
import {
  readCommunityUrlParams,
  writeCommunityUrlParams,
} from '../../../services/community-url-params';
import { establishCommunityStudentGate } from '../../../services/community-student-gate';
import { readPortalStudentKeyProof } from '../../../services/portal-student-key';
import {
  CommunityConnectionFallback,
  type CommunityConnectionReason,
} from './CommunityConnectionFallback';
import '../../../styles/tailwind-overlay.css';

type LoadState = 'checking' | 'loading' | 'ready' | 'unavailable';

const THEME_VARS = [
  '--p-bg',
  '--p-bg2',
  '--p-bg3',
  '--p-bg-hover',
  '--p-border',
  '--p-border-light',
  '--p-border-hover',
  '--p-text',
  '--p-text-muted',
  '--p-text-dim',
  '--p-text-dimmer',
  '--p-text-bright',
  '--p-accent',
  '--p-accent-light',
  '--p-accent-bg',
  '--p-accent-border',
  '--p-on-accent',
  '--p-avatar-ring',
  '--p-danger',
  '--p-danger-hover',
  '--p-shadow',
  '--p-shadow-strong',
  '--p-enter-dur',
  '--p-enter-ease',
  '--p-pop-dur',
] as const;

function communityIframeLang(language: AppLanguage): 'ja' | 'en' {
  return language === 'ja' ? 'ja' : 'en';
}

function collectThemeVars(): Record<string, string> {
  const overlay = document.getElementById(PORTAL_DOM.overlayRoot);
  if (!overlay) return {};
  const style = getComputedStyle(overlay);
  const vars: Record<string, string> = {};
  for (const name of THEME_VARS) {
    const value = style.getPropertyValue(name).trim();
    if (value) vars[name] = value;
  }
  const fontFamily = style.fontFamily.trim();
  if (fontFamily) vars['--p-font'] = fontFamily;
  return vars;
}

async function checkCommunityHealth(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/api/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(COMMUNITY_BOUNDARY_TIMING.healthTimeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function gateFailureReason(reason: 'forbidden' | 'network' | 'timeout'): CommunityConnectionReason {
  if (reason === 'timeout') return 'ready_timeout';
  return 'gate_failed';
}

export function CommunityActivityDrawer({
  language,
  apiOrigin,
  onClose,
}: {
  language: AppLanguage;
  apiOrigin: string;
  onClose: () => void;
}) {
  const messages = messagesForLanguage(language).community;
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const readyTimerRef = useRef<number | undefined>(undefined);
  const readyReceivedRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('checking');
  const [unavailableReason, setUnavailableReason] =
    useState<CommunityConnectionReason>('health_failed');
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const frameOrigin = useMemo(() => new URL(apiOrigin).origin, [apiOrigin]);

  const appUrl = useMemo(() => {
    const url = new URL('/app', frameOrigin);
    url.searchParams.set('lang', communityIframeLang(language));
    readCommunityUrlParams().forEach((value, key) => url.searchParams.set(key, value));
    return url.toString();
  }, [frameOrigin, language]);

  const sendTheme = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      { type: BRIDGE_MESSAGE.theme, vars: collectThemeVars() },
      frameOrigin,
    );
  }, [frameOrigin]);

  const finishClose = useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(finishClose, COMMUNITY_BOUNDARY_TIMING.drawerCloseMs);
  }, [closing, finishClose]);

  const markReady = useCallback(() => {
    if (readyReceivedRef.current) return;
    readyReceivedRef.current = true;
    if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
    setLoadState('ready');
  }, []);

  const retryLoad = useCallback(() => {
    readyReceivedRef.current = false;
    setIframeSrc(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoadState('checking');
      setUnavailableReason('reconnecting');
      readyReceivedRef.current = false;
      setIframeSrc(null);
      if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);

      const healthy = await checkCommunityHealth(frameOrigin);
      if (cancelled) return;
      if (!healthy) {
        setUnavailableReason('health_failed');
        setLoadState('unavailable');
        return;
      }

      const proof = await readPortalStudentKeyProof();
      if (cancelled) return;
      if (!proof) {
        setUnavailableReason('gate_failed');
        setLoadState('unavailable');
        return;
      }

      const gate = await establishCommunityStudentGate(frameOrigin, proof);
      if (cancelled) return;
      if (!gate.ok) {
        setUnavailableReason(gateFailureReason(gate.reason));
        setLoadState('unavailable');
        return;
      }

      setIframeSrc(appUrl);
      setLoadState('loading');
      readyTimerRef.current = window.setTimeout(() => {
        if (!readyReceivedRef.current) {
          setUnavailableReason('ready_timeout');
          setLoadState('unavailable');
        }
      }, COMMUNITY_BOUNDARY_TIMING.readyTimeoutMs);
    };

    void run();
    return () => {
      cancelled = true;
      if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
    };
  }, [appUrl, attempt, frameOrigin]);

  useEffect(() => {
    if (closing || loadState !== 'unavailable') return;
    const timer = window.setInterval(retryLoad, COMMUNITY_BOUNDARY_TIMING.reconnectIntervalMs);
    return () => window.clearInterval(timer);
  }, [closing, loadState, retryLoad]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== frameOrigin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown; search?: unknown } | null;
      if (!data || typeof data.type !== 'string') return;
      if (data.type === BRIDGE_MESSAGE.ready) {
        markReady();
        sendTheme();
      } else if (data.type === BRIDGE_MESSAGE.close) {
        requestClose();
      } else if (data.type === BRIDGE_MESSAGE.url && typeof data.search === 'string') {
        writeCommunityUrlParams(data.search);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frameOrigin, markReady, requestClose, sendTheme]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
    },
    [],
  );

  return (
    <div
      className={`p-community-activity-root${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={messages.drawerTitle}
    >
      <button
        type="button"
        className="p-community-activity-dismiss"
        onClick={requestClose}
        aria-label={messages.close}
      />
      <div className="p-community-activity-drawer">
        {loadState === 'unavailable' || loadState === 'checking' ? (
          <CommunityConnectionFallback
            messages={messages.connection}
            reason={loadState === 'checking' ? 'reconnecting' : unavailableReason}
            onRetry={retryLoad}
            onClose={requestClose}
          />
        ) : (
          <div className="tw-relative tw-h-full tw-min-h-0">
            {iframeSrc ? (
              <iframe
                ref={frameRef}
                id="p-community-activity-drawer"
                title={messages.drawerTitle}
                src={iframeSrc}
                className="tw-h-full tw-w-full tw-border-0 tw-bg-transparent"
                style={{
                  colorScheme: 'normal',
                  visibility: loadState === 'ready' ? 'visible' : 'hidden',
                }}
              />
            ) : null}
            {loadState === 'loading' ? (
              <div className="tw-absolute tw-inset-0">
                <CommunityConnectionFallback
                  messages={messages.connection}
                  reason="reconnecting"
                  onRetry={retryLoad}
                  onClose={requestClose}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
