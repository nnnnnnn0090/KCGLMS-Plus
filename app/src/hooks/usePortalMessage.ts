/**
 * `portal-hooks.content` が送る `postMessage` を受信するカスタムフックです。
 */

import { useEffect, useRef } from 'react';
import { subscribePortalInbox, type PortalCapturedMessage } from '../services/portal-inbox';

export type { PortalCapturedMessage };

type Handler = (msg: PortalCapturedMessage) => void;

export interface UsePortalMessageOptions {
  /** 指定時はこれらの type のみ handler を呼ぶ（例: 単一カレンダーパネル） */
  msgTypes?: readonly string[];
}

export function usePortalMessage(handler: Handler, options?: UsePortalMessageOptions): void {
  const types = options?.msgTypes;
  const typesKey = types?.join('\0') ?? '';
  const typesListRef = useRef(types);
  typesListRef.current = types;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribePortalInbox((msg) => handlerRef.current(msg), {
      msgTypes: typesListRef.current,
    });
  }, [typesKey]);
}
