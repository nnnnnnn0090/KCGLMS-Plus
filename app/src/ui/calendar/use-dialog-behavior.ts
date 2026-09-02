import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { prefersReducedMotion } from './anim';

export function useAnimatedClose(onClose: () => void, fallbackMs: number) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishClose = useCallback(() => {
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    closingRef.current = true;
    setClosing(true);
  }, [onClose]);

  useEffect(() => {
    if (!closing) return;
    fallbackRef.current = setTimeout(finishClose, fallbackMs);
    return () => {
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
    };
  }, [closing, fallbackMs, finishClose]);

  return { closing, requestClose, finishClose };
}

export function useDialogFocusTrap(
  rootRef: RefObject<HTMLElement | null>,
  requestClose: () => void,
): void {
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    const returnFocus = returnFocusRef.current;
    const focusables = () => {
      const root = rootRef.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.tabIndex !== -1);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = focusables();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !rootRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !rootRef.current?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [requestClose, rootRef]);
}
