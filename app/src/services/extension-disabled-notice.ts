const NOTICE_ID = 'kcglms-remote-disabled-notice';

/** オーバーレイやホストページの CSS に依存しない、サーバー停止中の案内。 */
export function showExtensionDisabledNotice(): void {
  if (!document.body || document.getElementById(NOTICE_ID)) return;

  const host = document.createElement('aside');
  host.id = NOTICE_ID;
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-atomic', 'true');
  host.style.cssText =
    'all:initial!important;position:fixed!important;right:16px!important;bottom:16px!important;' +
    'width:min(440px,calc(100vw - 32px))!important;z-index:2147483647!important;' +
    'display:block!important;visibility:visible!important;opacity:1!important;';

  const root = host.attachShadow({ mode: 'open' });
  const card = document.createElement('div');
  card.lang = 'ja';
  card.style.cssText =
    'box-sizing:border-box;padding:16px 18px;border:1px solid #f1d49b;border-radius:14px;' +
    'background:#fffbef;color:#59441f;box-shadow:0 6px 28px #30230d24;' +
    'font:14px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
    'overflow-wrap:anywhere;';

  const title = document.createElement('strong');
  title.style.cssText = 'display:block;margin:0 0 6px;font-size:14px;font-weight:700;';
  title.textContent = 'KCGLMS+ はメンテナンス中です';

  const message = document.createElement('p');
  message.style.cssText = 'margin:0;';
  message.textContent =
    '近日中に再開予定です。再開までの間も、通常の画面は引き続きご利用いただけます。';

  const hint = document.createElement('p');
  hint.style.cssText = 'margin:8px 0 0;font-size:12px;color:#78654a;';
  hint.textContent = '再開後、ページを再読み込みするとKCGLMS+の表示に戻ります。';

  card.append(title, message, hint);
  root.append(card);
  document.body.append(host);
}

export function hideExtensionDisabledNotice(): void {
  document.getElementById(NOTICE_ID)?.remove();
}
