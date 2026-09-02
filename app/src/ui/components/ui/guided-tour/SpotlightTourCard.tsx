import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import {
  clearRuntimeElementCss,
  setRuntimeElementCss,
} from '../../../../lib/runtime-element-style';

export function SpotlightTourCard({
  cardRef,
  positionCss,
  labelledBy,
  children,
}: {
  cardRef: RefObject<HTMLDivElement | null>;
  positionCss?: string;
  labelledBy: string;
  children: ReactNode;
}) {
  const localRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = localRef.current;
    cardRef.current = el;
    if (!el || !positionCss) return;
    setRuntimeElementCss(el, 'spotlight-position', positionCss);
    return () => {
      clearRuntimeElementCss(el, 'spotlight-position');
      if (cardRef.current === el) cardRef.current = null;
    };
  }, [cardRef, positionCss]);

  return (
    <div
      ref={localRef}
      className="p-tour-card p-tour-spotlight-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      {children}
    </div>
  );
}
