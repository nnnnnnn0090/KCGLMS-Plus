/**
 * キノメッセージ（ポータルお知らせ）パネルです。
 * 公式ポータルホームの該当パネルと同様の情報構造で表示します。
 */

import { formatMessageBody } from '../../../lib/dom';

interface KinoPanelProps {
  data: { title?: string; message?: string } | null;
}

export function KinoPanel({ data }: KinoPanelProps) {
  const title = data ? String(data.title ?? '').trim() : '';
  const message = data ? String(data.message ?? '').trim() : '';
  if (!title || !message) return null;

  return (
    <section className="p-panel p-panel-kino" id="p-kino-panel">
      <span className="p-panel-head" id="p-kino-title">
        {title}
      </span>
      <div className="p-panel-body">
        <div
          className="p-kino-message"
          id="p-kino-body"
          dangerouslySetInnerHTML={{ __html: formatMessageBody(message) }}
        />
      </div>
    </section>
  );
}
