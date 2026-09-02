/**
 * カレンダーのツールチップとコンテキストメニュー用 DOM への ref を React ツリーで共有します。
 * `getElementById` の散在を避け、マウント順と表示先を一致させます。
 */

import { createContext, useContext, useMemo, useRef, type ReactNode, type RefObject } from 'react';

export interface CalendarOverlayUiRefs {
  hoverPopRef: RefObject<HTMLDivElement | null>;
  ctxMenuRef: RefObject<HTMLDivElement | null>;
  btnSylRef: RefObject<HTMLButtonElement | null>;
  btnKingRef: RefObject<HTMLButtonElement | null>;
}

const CalendarOverlayUiContext = createContext<CalendarOverlayUiRefs | null>(null);

export function CalendarOverlayUiProvider({ children }: { children: ReactNode }) {
  const hoverPopRef = useRef<HTMLDivElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const btnSylRef = useRef<HTMLButtonElement>(null);
  const btnKingRef = useRef<HTMLButtonElement>(null);
  // deps が [] なのは意図的。ref オブジェクト自体は安定しており再生成は不要。
  // useMemo を使う理由はコンテキスト値のオブジェクト同一性を保ち、
  // 子コンポーネントの不要な再レンダーを防ぐため。
  const value = useMemo(() => ({ hoverPopRef, ctxMenuRef, btnSylRef, btnKingRef }), []);
  return (
    <CalendarOverlayUiContext.Provider value={value}>{children}</CalendarOverlayUiContext.Provider>
  );
}

export function useCalendarOverlayUiRefs(): CalendarOverlayUiRefs {
  const ctx = useContext(CalendarOverlayUiContext);
  if (!ctx) {
    throw new Error('useCalendarOverlayUiRefs は CalendarOverlayUiProvider 内で使ってください');
  }
  return ctx;
}

export function useOptionalCalendarOverlayUiRefs(): CalendarOverlayUiRefs | null {
  return useContext(CalendarOverlayUiContext);
}
