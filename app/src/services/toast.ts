/**
 * トースト通知の状態管理（`#p-toast`、時間値 3 種、placement、sessionStorage 1 回制御）。
 */

import { useState, useCallback, useRef } from 'react';
import { TIMING } from '../contract/timing';

const DURATION_MS = TIMING.toastDefaultMs;
const CLOSE_FALLBACK_MS = TIMING.toastCloseFallbackMs;

export interface ToastState {
  message: string;
  placement: 'bottom' | 'top';
  visible: boolean;
  closing: boolean;
}

export interface ToastShowOptions {
  placement?: 'bottom' | 'top';
  durationMs?: number;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({
    message: '',
    placement: 'bottom',
    visible: false,
    closing: false,
  });
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelAnimRef = useRef<(() => void) | null>(null);

  const show = useCallback((msg: string, opts?: ToastShowOptions) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (cancelAnimRef.current) {
      cancelAnimRef.current();
      cancelAnimRef.current = null;
    }

    setToast({
      message: msg,
      placement: opts?.placement ?? 'bottom',
      visible: true,
      closing: false,
    });

    const durationMs =
      typeof opts?.durationMs === 'number' && opts.durationMs > 0 ? opts.durationMs : DURATION_MS;
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      const reduced =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        setToast((prev) => ({ ...prev, visible: false, closing: false }));
        return;
      }
      setToast((prev) => ({ ...prev, closing: true }));
      const fallback = setTimeout(() => {
        cancelAnimRef.current = null;
        setToast((prev) => ({ ...prev, visible: false, closing: false }));
      }, CLOSE_FALLBACK_MS);
      cancelAnimRef.current = () => clearTimeout(fallback);
    }, durationMs);
  }, []);

  function onAnimationEnd(e: React.AnimationEvent<HTMLDivElement>) {
    if (e.animationName !== 'p-toast-out' && e.animationName !== 'p-toast-out-top') return;
    if (cancelAnimRef.current) {
      cancelAnimRef.current();
      cancelAnimRef.current = null;
    }
    setToast((prev) => ({ ...prev, visible: false, closing: false }));
  }

  return { toast, show, onAnimationEnd };
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      void error;
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'tw-fixed tw-left-[-9999px] tw-top-0 tw-opacity-0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (error) {
    void error;
    return false;
  }
}

/** King LMS 同期完了トーストの表示時間 */
export function syncToastDurationMs(message: string): number | undefined {
  return message.length > 48 ? TIMING.toastSyncLongMs : undefined;
}

/** 拡張更新トーストの表示時間 */
export const extensionUpdateToastDurationMs = TIMING.toastUpdateMs;
