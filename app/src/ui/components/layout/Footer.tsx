/**
 * サイトフッター。既存のポータル DOM からフッターのコンテンツを取り込んで表示する。
 */

import { useEffect, useRef } from 'react';
import {
  EXTENSION_AUTHOR_CREDIT_TEXT,
  EXTENSION_AUTHOR_PROFILE_URL,
  PORTAL_DOM,
} from '../../../shared/constants';
import { useI18n } from '../../../i18n';

/** ポータル用フッターが無いとき、ホストの `.footer` 文言を載せる */
function appendHostPlainFooterLine(mount: HTMLElement): void {
  if (mount.querySelector('.p-footer-host-copy')) return;
  const sels = ['.page .footer', 'body > .footer', '.footer'];
  for (const sel of sels) {
    let found: HTMLElement | undefined;
    try {
      found = [...document.querySelectorAll(sel)].find(
        (n): n is HTMLElement =>
          n instanceof HTMLElement && !n.closest(`#${PORTAL_DOM.overlayRoot}`),
      );
    } catch {
      continue;
    }
    if (!found) continue;
    const text = found.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!text) continue;
    const p = document.createElement('p');
    p.className = 'p-footer-host-copy';
    p.textContent = text;
    mount.appendChild(p);
    return;
  }
}

function appendRedesignedCredit(mount: HTMLElement): void {
  if (mount.querySelector('.p-footer-credit')) return;
  const creditEl = document.createElement('small');
  creditEl.className = 'p-footer-credit';
  creditEl.appendChild(document.createTextNode('Redesigned by '));
  const creditLink = document.createElement('a');
  creditLink.href = EXTENSION_AUTHOR_PROFILE_URL;
  creditLink.target = '_blank';
  creditLink.rel = 'noopener noreferrer';
  creditLink.textContent = EXTENSION_AUTHOR_CREDIT_TEXT;
  creditEl.appendChild(creditLink);
  const copyrightSm = mount.querySelector('small');
  if (copyrightSm) copyrightSm.after(creditEl);
  else mount.appendChild(creditEl);
}

export function Footer() {
  const { t } = useI18n();
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ポータル元 DOM のフッターコンテナを探す
    const selectors = [
      'body > footer .container',
      'footer .container',
      '#footer .container',
      '.footer .container',
    ];
    const src = selectors.reduce<Element | null>((found, sel) => {
      if (found) return found;
      try {
        return (
          [...document.querySelectorAll(sel)].find(
            (c) => !c.closest(`#${PORTAL_DOM.overlayRoot}`) && c.querySelector('small'),
          ) ?? null
        );
      } catch {
        return null;
      }
    }, null);

    mount.replaceChildren();

    if (src) {
      for (const child of src.children) {
        if (child.tagName !== 'SCRIPT') mount.appendChild(child.cloneNode(true));
      }
      mount
        .querySelectorAll('.pageTop, a[href="#top"], a[href="#Top"]')
        .forEach((el) => el.remove());
    } else {
      appendHostPlainFooterLine(mount);
    }

    appendRedesignedCredit(mount);
  }, []);

  return (
    <footer className="p-site-footer" id="p-site-footer" aria-label={t.footer.aria}>
      <div className="container" ref={mountRef} />
    </footer>
  );
}
