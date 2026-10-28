/**
 * ホームの案内（周りを暗くして、機能を1つずつ光らせる）。
 *
 * 次の場所へ移るときは、ページのスクロールと光る枠の移動を1つのアニメーションとして
 * 同じ時間・同じ速さの変化で動かす。枠は移動中ずっと実際の対象へ近づき、終わりにぴったり重なる。
 * 説明カードは移動の初めに消え、枠が着いてから新しい場所の横に現れる。
 *
 * - 光っている所はそのまま操作できる
 * - 説明カードは対象を隠さない側（下・上・右・左）に出し、矢印で指す
 * - スクロール・リサイズ・要素の大きさの変化に追従する
 * - 画面にない機能は自動で飛ばす。← → Esc で操作でき、フォーカスはカード内に留まる
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import type { I18nMessages } from '../../../../i18n/messages';
import {
  blockersAround,
  flightDurationMs,
  easeInOutCubic,
  lerpRect,
  placeSpotlightCard,
  sameRect,
  scrollTopToReveal,
  spotlightHole,
  type CardPlacement,
  type Rect,
  type Viewport,
} from './spotlight-layout';
import { availableTourStops, findStopTarget, type TourStop } from './tour-stops';

/** 説明カードが消えるまでの時間（CSS と合わせる）。この後で中身を次の場所のものに替える */
const CARD_FADE_OUT_MS = 160;
/** スクロールが止まったとみなすまでに、位置が変わらないフレーム数 */
const STABLE_FRAMES = 8;
/** 追従を続ける最長時間 */
const TRACK_MAX_MS = 2000;
/** カードの高さが測れるまでの仮の値 */
const DEFAULT_CARD_HEIGHT = 280;

interface SpotlightTourProps {
  overlayRoot: HTMLElement;
  t: I18nMessages;
  /** 最初の場所で「戻る」を押したとき（初期設定へ戻る） */
  onBack: () => void;
  /** 最後の場所で「次へ」を押したとき */
  onComplete: () => void;
  /** 「案内を終える」・Esc */
  onClose: () => void;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function toRect(r: DOMRect): Rect {
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** 固定ヘッダーの下端（対象がヘッダーの中ならカードをヘッダーの上にも置けるよう 0） */
function headerInset(root: HTMLElement, target: HTMLElement): number {
  const header = root.querySelector('.p-header');
  if (!(header instanceof HTMLElement) || header.contains(target)) return 0;
  const rect = header.getBoundingClientRect();
  return rect.top <= 1 ? Math.max(0, rect.bottom) : 0;
}

function readViewport(root: HTMLElement, target: HTMLElement): Viewport {
  return { w: window.innerWidth, h: window.innerHeight, topInset: headerInset(root, target) };
}

/** 対象が見える位置までのスクロール量 */
function revealScrollTop(root: HTMLElement, target: HTMLElement): number {
  const rootRect = root.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  return scrollTopToReveal(
    {
      x: targetRect.left,
      y: targetRect.top - rootRect.top,
      w: targetRect.width,
      h: targetRect.height,
    },
    { scrollTop: root.scrollTop, maxScrollTop: root.scrollHeight - root.clientHeight },
    { w: rootRect.width, h: rootRect.height, topInset: headerInset(root, target) },
  );
}

function scrollInstantly(root: HTMLElement, top: number): void {
  root.scrollTo({ top, left: 0, behavior: 'instant' as ScrollBehavior });
}

export function SpotlightTour({ overlayRoot, t, onBack, onComplete, onClose }: SpotlightTourProps) {
  const copy = t.guidedTour.spot;
  const [stops] = useState<TourStop[]>(() => availableTourStops(overlayRoot));
  /** 向かっている場所 */
  const [index, setIndex] = useState(0);
  /** カードに表示している場所（移動中は前の場所のまま、カードが消えてから切り替える） */
  const [shownIndex, setShownIndex] = useState(0);
  /** 枠が着いて、カードを見せてよいか */
  const [landed, setLanded] = useState(false);
  const [hole, setHole] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState<Viewport>(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
    topInset: 0,
  }));
  const [cardHeight, setCardHeight] = useState(DEFAULT_CARD_HEIGHT);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const holeRef = useRef<Rect | null>(null);
  const flyingRef = useRef(false);
  const flightFrameRef = useRef(0);
  const trackFrameRef = useRef(0);
  const placementRef = useRef<CardPlacement | null>(null);

  const stop = stops[index];

  // 案内できる場所が1つもなければ、そのまま終わりの画面へ。
  useEffect(() => {
    if (stops.length === 0) onComplete();
  }, [stops.length, onComplete]);

  const commitHole = useCallback((next: Rect) => {
    holeRef.current = next;
    setHole((current) => (sameRect(current, next) ? current : next));
  }, []);

  const measure = useCallback(() => {
    const target = targetRef.current;
    if (!target || !target.isConnected) return;
    commitHole(spotlightHole(toRect(target.getBoundingClientRect())));
    const nextViewport = readViewport(overlayRoot, target);
    setViewport((current) =>
      current.w === nextViewport.w &&
      current.h === nextViewport.h &&
      current.topInset === nextViewport.topInset
        ? current
        : nextViewport,
    );
  }, [commitHole, overlayRoot]);

  /** 利用者のスクロールなどが止まるまで毎フレーム追従する（移動アニメーション中は何もしない） */
  const track = useCallback(() => {
    if (flyingRef.current) return;
    cancelAnimationFrame(trackFrameRef.current);
    const started = performance.now();
    let last: Rect | null = null;
    let stable = 0;
    const tick = () => {
      const target = targetRef.current;
      if (!target || flyingRef.current) return;
      const rect = toRect(target.getBoundingClientRect());
      measure();
      stable = sameRect(last, rect) ? stable + 1 : 0;
      last = rect;
      if (stable < STABLE_FRAMES && performance.now() - started < TRACK_MAX_MS) {
        trackFrameRef.current = requestAnimationFrame(tick);
      }
    };
    trackFrameRef.current = requestAnimationFrame(tick);
  }, [measure]);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0) {
        onBack();
        return;
      }
      if (next >= stops.length) {
        onComplete();
        return;
      }
      setIndex(next);
    },
    [onBack, onComplete, stops.length],
  );

  // 場所が変わったら: カードを消す → スクロールと枠の移動を一緒に動かす → 着いたらカードを出す。
  useLayoutEffect(() => {
    if (!stop) return;
    const target = findStopTarget(stop, overlayRoot);
    if (!target) {
      // 途中で消えた（表示を切り替えた等）ものは飛ばす。
      goTo(index + 1);
      return;
    }
    targetRef.current = target;
    cancelAnimationFrame(trackFrameRef.current);
    cancelAnimationFrame(flightFrameRef.current);
    setLanded(false);

    const startScroll = overlayRoot.scrollTop;
    const endScroll = revealScrollTop(overlayRoot, target);

    if (prefersReducedMotion()) {
      scrollInstantly(overlayRoot, endScroll);
      measure();
      setShownIndex(index);
      setLanded(true);
      return;
    }

    // 最初は画面全体から対象へ絞り込む（周りが外側からゆっくり暗くなる）。
    const from = holeRef.current ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    const firstTarget = spotlightHole(toRect(target.getBoundingClientRect()));
    const duration = flightDurationMs(from, firstTarget, Math.abs(endScroll - startScroll));
    const started = performance.now();
    flyingRef.current = true;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = easeInOutCubic(progress);
      scrollInstantly(overlayRoot, startScroll + (endScroll - startScroll) * eased);
      // 毎フレーム、対象の「今の位置」へ向けて補間するので、終わりに必ずぴったり重なる。
      const live = spotlightHole(toRect(target.getBoundingClientRect()));
      commitHole(lerpRect(from, live, eased));
      if (progress < 1) {
        flightFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      flyingRef.current = false;
      measure();
      setLanded(true);
    };
    flightFrameRef.current = requestAnimationFrame(tick);

    // カードが消えきってから中身を替え、着くまでに新しい高さを測っておく。
    const swap = window.setTimeout(() => setShownIndex(index), CARD_FADE_OUT_MS);
    return () => {
      window.clearTimeout(swap);
      cancelAnimationFrame(flightFrameRef.current);
      flyingRef.current = false;
    };
  }, [commitHole, goTo, index, measure, overlayRoot, stop]);

  // 画面の変化に追従する。
  useEffect(() => {
    const target = targetRef.current;
    const onChange = () => track();
    window.addEventListener('resize', onChange);
    overlayRoot.addEventListener('scroll', onChange, { capture: true, passive: true });
    const observer = new ResizeObserver(onChange);
    if (target) observer.observe(target);
    return () => {
      window.removeEventListener('resize', onChange);
      overlayRoot.removeEventListener('scroll', onChange, true);
      observer.disconnect();
      cancelAnimationFrame(trackFrameRef.current);
    };
  }, [index, overlayRoot, track]);

  // カードの高さを測る（配置の計算に使う）。
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const update = () => {
      const height = card.getBoundingClientRect().height;
      if (height > 0) {
        setCardHeight((current) => (Math.abs(current - height) < 1 ? current : height));
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(card);
    return () => observer.disconnect();
  }, [shownIndex]);

  // カードが出たら「次へ」へフォーカスする（画面は動かさない）。
  useEffect(() => {
    if (landed) primaryRef.current?.focus({ preventScroll: true });
  }, [landed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(index + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(index - 1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [goTo, index, onClose]);

  /** Tab でカードの外へ出ないようにする */
  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = cardRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  /** 暗い部分の上でもページをスクロールできるようにする */
  const forwardWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    overlayRoot.scrollBy({ top: event.deltaY, left: 0, behavior: 'auto' });
  };

  const shownStop = stops[shownIndex];
  if (!stop || !shownStop) return null;

  // 着いている間は枠に合わせて置き直し、移動中は消える前の位置のままにする。
  const livePlacement = hole ? placeSpotlightCard(hole, cardHeight, viewport) : null;
  if (landed && livePlacement) placementRef.current = livePlacement;
  const placement = landed ? livePlacement : (placementRef.current ?? livePlacement);
  const stopCopy = copy.stops[shownStop.id];
  const vertical = placement?.side === 'top' || placement?.side === 'bottom';
  const cardStyle: CSSProperties = placement
    ? { left: placement.left, top: placement.top, width: placement.width }
    : { visibility: 'hidden' };
  const arrowStyle: CSSProperties | undefined =
    placement?.arrow !== null && placement?.arrow !== undefined
      ? vertical
        ? { left: placement.arrow }
        : { top: placement.arrow }
      : undefined;
  const blockers = hole ? blockersAround(hole, viewport.w, viewport.h) : null;

  return (
    <div className="p-spot-root">
      {blockers ? (
        blockers.map((rect) => (
          <div
            key={`${rect.x}-${rect.y}`}
            className="p-spot-blocker"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            onWheel={forwardWheel}
            aria-hidden
          />
        ))
      ) : (
        <div className="p-spot-blocker p-spot-blocker--full" onWheel={forwardWheel} aria-hidden />
      )}
      {hole ? (
        <div
          className="p-spot-hole"
          style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
          aria-hidden
        />
      ) : null}

      <div
        ref={cardRef}
        className={`p-spot-card is-${placement?.side ?? 'bottom'}${landed ? ' is-landed' : ''}`}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="p-spot-title"
        aria-describedby="p-spot-lead"
        aria-hidden={!landed}
        onKeyDown={trapFocus}
      >
        {arrowStyle ? <span className="p-spot-arrow" style={arrowStyle} aria-hidden /> : null}
        <div className="p-spot-head">
          <span className="p-tour-eyebrow">{copy.eyebrow}</span>
          <span className="p-spot-count" aria-live="polite">
            {shownIndex + 1} / {stops.length}
          </span>
        </div>
        <h2 id="p-spot-title">{stopCopy.title}</h2>
        <p id="p-spot-lead" className="p-spot-lead">
          {stopCopy.lead}
        </p>
        <ul className="p-spot-tips">
          {stopCopy.tips.map((tip: string) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
        {shownIndex === 0 ? (
          <p className="p-spot-note">{`${copy.tryIt} ${copy.keysHint}`}</p>
        ) : null}

        <div className="p-spot-dots">
          {stops.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={`p-spot-dot${i === index ? ' is-current' : ''}${i < index ? ' is-done' : ''}`}
              aria-label={copy.jump(i + 1)}
              aria-current={i === index ? 'step' : undefined}
              onClick={() => goTo(i)}
            />
          ))}
        </div>

        <div className="p-spot-actions">
          <button type="button" className="p-tour-skip" onClick={onClose}>
            {copy.close}
          </button>
          <div className="p-spot-actions-main">
            <button type="button" className="p-tour-back" onClick={() => goTo(index - 1)}>
              {t.guidedTour.back}
            </button>
            <button
              ref={primaryRef}
              type="button"
              className="p-tour-primary"
              onClick={() => goTo(index + 1)}
            >
              {t.common.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
