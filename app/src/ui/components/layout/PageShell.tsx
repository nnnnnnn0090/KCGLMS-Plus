/**
 * 全ページ共通の <main> + 見出し行ラッパ。
 * 詳細ページのように見出しをカスタムする場合は head を渡す。
 */

import type { ReactNode } from 'react';

export interface PageShellProps {
  /** `p-main-news`（お知らせ系ワイドレイアウト）を付与 */
  variant?: 'default' | 'news';
  /** 通常時: .p-main-head 内の <h1> として表示 */
  title?: ReactNode;
  /** .p-main-head 内、h1 の横（例: 前回ログイン） */
  headExtra?: ReactNode;
  /** 指定時は title / headExtra を無視し、そのまま描画（先頭に .p-main-head を含めること） */
  head?: ReactNode;
  /** true のとき見出し行なし（遅延ロードのプレースホルダー用） */
  hideHead?: boolean;
  children: ReactNode;
}

export function PageShell({
  variant = 'default',
  title,
  headExtra,
  head,
  hideHead,
  children,
}: PageShellProps) {
  const mainCls = variant === 'news' ? 'p-main p-main-news' : 'p-main';
  return (
    <main className={mainCls}>
      {!hideHead &&
        (head ?? (
          <div className="p-main-head">
            {title != null ? <h1>{title}</h1> : null}
            {headExtra}
          </div>
        ))}
      {children}
    </main>
  );
}
