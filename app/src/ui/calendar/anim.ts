/**
 * カレンダー周りのアニメーションと、それに伴う軽い DOM 操作ユーティリティです。
 * 週送りのスワイプやモード切替のフェード、`transitionend` の待機などを担います。
 */

import { setHtml } from '../../lib/dom';
import { clearRuntimeElementCss, setRuntimeElementCss } from '../../lib/runtime-element-style';

// ─── アクセシビリティ ─────────────────────────────────────────────────────

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// ─── レイアウトタイミング ─────────────────────────────────────────────────

/** 2 フレーム後に実行（強制レイアウト後に transition を開始するため） */
export function afterLayout(fn: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

// ─── transition / animation 待機 ─────────────────────────────────────────

export function waitForTransition(
  el: Element,
  propertyName: string,
  callback: () => void,
  maxMs = 400,
): { cancel: () => void } {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.removeEventListener('transitionend', handler);
    clearTimeout(fallback);
    callback();
  };
  const handler: EventListener = (ev: Event) => {
    if (!(ev instanceof TransitionEvent)) return;
    if (ev.target !== el) return;
    if (propertyName && ev.propertyName !== propertyName) return;
    finish();
  };
  el.addEventListener('transitionend', handler);
  const fallback = setTimeout(finish, maxMs);
  return { cancel: finish };
}

export function waitForAnimation(
  el: Element,
  callback: () => void,
  maxMs = 500,
): { cancel: () => void } {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.removeEventListener('animationend', handler);
    clearTimeout(fallback);
    callback();
  };
  const handler: EventListener = (ev: Event) => {
    if (!(ev instanceof AnimationEvent)) return;
    if (ev.target !== el) return;
    finish();
  };
  el.addEventListener('animationend', handler);
  const fallback = setTimeout(finish, maxMs);
  return { cancel: finish };
}

// ─── ローディング属性のクリア ─────────────────────────────────────────────

/**
 * カレンダー本体要素の `data-cal-loading` / `data-cal-mode` と `minHeight` を消します。
 * ローディング中に仮で入れた最低高さを外すために呼びます。
 */
export function clearCalBodyLoadingAttrs(mount: HTMLElement | null | undefined): void {
  if (!mount) return;
  delete mount.dataset.calLoading;
  delete mount.dataset.calMode;
  clearRuntimeElementCss(mount, 'min-height');
}

// ─── スワイプアニメーション ───────────────────────────────────────────────

/**
 * 前週・次週へ移るときのスライド切り替えです。
 * `oldHtml` から `newHtml` へトランジションで渡します。
 */
export function applyCalSwipe(
  bodyEl: HTMLElement | null,
  dir: 'prev' | 'next',
  oldHtml: string,
  newHtml: string,
  onDone?: () => void,
): void {
  const done = () => onDone?.();
  if (!bodyEl) {
    done();
    return;
  }

  if (prefersReducedMotion()) {
    setHtml(bodyEl, newHtml);
    done();
    return;
  }

  const trackClass =
    dir === 'next' ? 'p-cal-swipe-track p-cal-swipe--next' : 'p-cal-swipe-track p-cal-swipe--prev';
  const firstCell = dir === 'next' ? oldHtml : newHtml;
  const secondCell = dir === 'next' ? newHtml : oldHtml;

  setHtml(
    bodyEl,
    `<div class="p-cal-swipe-viewport"><div class="${trackClass}">` +
      `<div class="p-cal-swipe-cell">${firstCell}</div>` +
      `<div class="p-cal-swipe-cell">${secondCell}</div>` +
      '</div></div>',
  );

  const track = bodyEl.querySelector('.p-cal-swipe-track');
  if (!track) {
    setHtml(bodyEl, newHtml);
    done();
    return;
  }

  waitForTransition(
    track,
    'transform',
    () => {
      setHtml(bodyEl, newHtml);
      done();
    },
    500,
  );

  afterLayout(() => track.classList.add('is-mid'));
}

// ─── モード切替アニメーション ─────────────────────────────────────────────

/**
 * 週表示と月表示を切り替えるときのフェードインを再生します。
 * `setHtml` の直後（初回ペイント前）に呼ぶ想定です。
 * `animation-fill-mode: both` により、クラス付与と同時に `opacity: 0` の開始フレームが効くため、
 * グリッドが一瞬見えてから消えるチラつきを抑えます（`afterLayout` は不要）。
 */
export function playCalModeEnterAnim(bodyEl: HTMLElement | null): void {
  if (!bodyEl || prefersReducedMotion()) return;
  const el = bodyEl.querySelector('.p-cal-grid') ?? bodyEl.querySelector('.p-empty');
  if (!el || !bodyEl.contains(el)) return;
  el.classList.add('p-cal-mode-swap-in');
  const { cancel } = waitForAnimation(
    el,
    () => {
      el.classList.remove('p-cal-mode-swap-in');
    },
    500,
  );
  setTimeout(() => {
    if (!document.contains(el)) cancel();
  }, 600);
}

// ─── 高さアニメーション ───────────────────────────────────────────────────

/**
 * HTML を差し替えつつ、高さの変化をスムーズに見せます。
 * 高さ差が 3px 未満ならアニメーションは行いません。
 */
export function setCalBodyHtmlSmooth(
  el: HTMLElement | null,
  newHtml: string,
  onDone?: () => void,
  opts?: { playEnterAnim?: boolean },
): void {
  if (!el) {
    onDone?.();
    return;
  }

  if (prefersReducedMotion()) {
    setHtml(el, newHtml);
    onDone?.();
    return;
  }

  const h0 = Math.max(1, Math.round(el.getBoundingClientRect().height));
  setHtml(el, newHtml);
  // フェードイン開始は setHtml の直後（初回ペイント前）。done() の後では遅すぎてフリッカーが出る。
  if (opts?.playEnterAnim) playCalModeEnterAnim(el);
  const h1 = Math.max(1, Math.round(el.getBoundingClientRect().height));

  if (Math.abs(h0 - h1) < 3) {
    onDone?.();
    return;
  }

  setRuntimeElementCss(el, 'height-transition', `transition:none;min-height:${h0}px`);

  afterLayout(() => {
    // cubic-bezier(0.33, 1, 0.32, 1) は「勢いよく伸びてぴたっと止まる」ease-out 系カーブ。
    setRuntimeElementCss(
      el,
      'height-transition',
      `transition:min-height 0.42s cubic-bezier(0.33, 1, 0.32, 1);min-height:${h1}px`,
    );
  });

  // 550ms = transition 時間 420ms + バッファ 130ms。transitionend が来なかった場合のフォールバック。
  waitForTransition(
    el,
    'min-height',
    () => {
      clearRuntimeElementCss(el, 'height-transition');
      onDone?.();
    },
    550,
  );
}
