/**
 * コンテンツスクリプトが作成した #portal-overlay 要素と、設定ポップオーバー DOM への参照。
 * getElementById 依存を React ツリー内で共有する。
 */

import { createContext, useContext, useMemo, useRef, type ReactNode, type RefObject } from 'react';

export interface PortalDomContextValue {
  overlayRoot: HTMLElement;
  settingsPopRef: RefObject<HTMLDivElement | null>;
}

const PortalDomContext = createContext<PortalDomContextValue | null>(null);

export function PortalDomProvider({
  overlayRoot,
  children,
}: {
  overlayRoot: HTMLElement;
  children: ReactNode;
}) {
  const settingsPopRef = useRef<HTMLDivElement | null>(null);
  const value = useMemo(() => ({ overlayRoot, settingsPopRef }), [overlayRoot]);
  return <PortalDomContext.Provider value={value}>{children}</PortalDomContext.Provider>;
}

export function usePortalDom(): PortalDomContextValue {
  const ctx = useContext(PortalDomContext);
  if (!ctx) throw new Error('usePortalDom は PortalDomProvider 内で使ってください');
  return ctx;
}
