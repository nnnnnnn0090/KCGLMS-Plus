/**
 * DOM 操作ユーティリティ（HTML エスケープ・安全な innerHTML 置換・プレーンテキスト変換）。
 * 純粋な文字列変換は lib/date.ts など、DOM に依存する処理はすべてここに集約する。
 */

import DOMPurify from 'dompurify';

const HOST_HTML_TAGS = [
  'a',
  'b',
  'br',
  'div',
  'em',
  'i',
  'li',
  'ol',
  'p',
  'span',
  'strong',
  'ul',
] as const;

const HOST_HTML_ATTR = ['class', 'href', 'rel', 'target', 'title'] as const;

/** ホストページ由来 HTML（Cplan お知らせ等）を表示用にサニタイズする。 */
export function sanitizeHostHtml(raw: string): string {
  const sanitized = DOMPurify.sanitize(String(raw ?? ''), {
    ALLOWED_TAGS: [...HOST_HTML_TAGS],
    ALLOWED_ATTR: [...HOST_HTML_ATTR],
  });
  const doc = new DOMParser().parseFromString(sanitized, 'text/html');
  for (const anchor of doc.body.querySelectorAll('a[href]')) {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  }
  return doc.body.innerHTML;
}

// ─── HTML エスケープ ───────────────────────────────────────────────────────

/** テキストノード挿入用エスケープ */
export function esc(s: unknown): string {
  const div = document.createElement('div');
  div.textContent = String(s ?? '');
  return div.innerHTML;
}

/** HTML 属性値用エスケープ */
export function escAttr(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

// ─── HTML 挿入 ─────────────────────────────────────────────────────────────

/**
 * container の中身を HTML 文字列で安全に置き換える。
 * tbody / thead / ul / ol は構造を保つためラップしてパースする。
 */
export function setHtml(container: Element | null | undefined, html: string): void {
  if (!container) return;
  const tag = container.tagName;

  if (tag === 'TBODY' || tag === 'THEAD' || tag === 'TFOOT') {
    const t = tag.toLowerCase();
    const doc = new DOMParser().parseFromString(`<table><${t}>${html}</${t}></table>`, 'text/html');
    const inner = doc.querySelector(t);
    if (inner) {
      container.replaceChildren(...inner.childNodes);
      return;
    }
  }

  if (tag === 'UL' || tag === 'OL') {
    const t = tag.toLowerCase();
    const doc = new DOMParser().parseFromString(`<${t}>${html}</${t}>`, 'text/html');
    const inner = doc.querySelector(t);
    if (inner) {
      container.replaceChildren(...inner.childNodes);
      return;
    }
  }

  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  container.replaceChildren(...doc.body.childNodes);
}

// ─── HTML → プレーンテキスト ──────────────────────────────────────────────

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'li',
  'tr',
  'section',
  'article',
  'header',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

function walkText(node: Node): string {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === 'br') {
        out += '\n';
        continue;
      }
      const inner = walkText(child);
      if (BLOCK_TAGS.has(tag)) {
        const t = inner.trim();
        if (t) out += (out && !/\n\s*$/.test(out) ? '\n' : '') + t + '\n';
      } else {
        out += inner;
      }
    }
  }
  return out;
}

/**
 * HTML をプレーンテキストに変換する（カレンダー tooltip などに利用）。
 */
export function plainFromHtml(html: string): string {
  const s = String(html ?? '');
  if (!s) return '';
  const doc = new DOMParser().parseFromString(s, 'text/html');
  let t = walkText(doc.body)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+\n/g, '\n')
    .replace(/\n[ \t\f\v]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // 単一行の場合のみ、日本語の区切り文字で改行を補完する
  if (!/\n/.test(t)) {
    t = t
      .replace(/\s*(?=(?:教室|時限|担当|科目|講師|備考|コメント)[：:])/g, '\n')
      .replace(/([。．])\s*(?=\S)/g, '$1\n')
      .trim();
  }
  return t;
}

// ─── テキスト整形 ──────────────────────────────────────────────────────────

/** お知らせ詳細ページ URL */
export function newsHref(id: string | number): string {
  return `${location.origin}/portal/News/Detail/${encodeURIComponent(String(id))}`;
}

/**
 * キノメッセージ本文をテキスト → 表示用 HTML に変換する。
 * 改行 → <br>、URL → <a>
 */
export function formatMessageBody(raw: string): string {
  const escaped = esc(String(raw ?? ''));
  const withBr = escaped.replace(/\r?\n/g, '<br>');
  const urlRe = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#/%?=~_|!:,.;]*[-A-Z0-9+&@#/%=~_|])/gi;
  return withBr.replace(
    urlRe,
    (url) => `<a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`,
  );
}
