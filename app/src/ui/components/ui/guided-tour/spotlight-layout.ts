/**
 * ホームの案内（スポットライト）の位置計算。DOM に触れない純粋関数のみ。
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Viewport {
  w: number;
  h: number;
  /** 上端の固定ヘッダーなど、カードを置かない高さ */
  topInset: number;
}

export type CardSide =
  | 'bottom'
  | 'top'
  | 'right'
  | 'left'
  | 'inside'
  | 'sheet-bottom'
  | 'sheet-top';

export interface CardPlacement {
  left: number;
  top: number;
  width: number;
  side: CardSide;
  /** 矢印の位置（カードの左端または上端からの距離）。矢印を出さない配置では null */
  arrow: number | null;
}

/** 画面の端からの余白 */
export const SPOT_MARGIN = 12;
/** 対象とカードの間隔 */
export const SPOT_GAP = 14;
/** 対象の周りの余白 */
export const SPOT_PAD = 8;
/** カードの幅（広い画面） */
export const SPOT_CARD_WIDTH = 360;
/** これより狭い画面では、カードを下（または上）のシートとして出す */
export const SPOT_SHEET_BREAKPOINT = 640;
/** 矢印を角の丸みにかけないための余白 */
const ARROW_EDGE = 22;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/** 対象の矩形に余白を足したもの（光らせる範囲） */
export function spotlightHole(target: Rect, pad = SPOT_PAD): Rect {
  return { x: target.x - pad, y: target.y - pad, w: target.w + pad * 2, h: target.h + pad * 2 };
}

/** 2つの矩形がほぼ同じか（毎フレームの再描画を避ける） */
export function sameRect(a: Rect | null, b: Rect | null, tolerance = 0.5): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.w - b.w) <= tolerance &&
    Math.abs(a.h - b.h) <= tolerance
  );
}

/**
 * カードの置き場所を決める。対象を隠さない場所を、下 → 上 → 右 → 左 の順に探し、
 * どこにも入らなければ（対象が大きいとき）画面の中の対象の右下に重ねる。
 */
export function placeSpotlightCard(
  hole: Rect,
  cardHeight: number,
  viewport: Viewport,
): CardPlacement {
  const { w: vw, h: vh, topInset } = viewport;
  const top0 = Math.max(SPOT_MARGIN, topInset);

  if (vw < SPOT_SHEET_BREAKPOINT) {
    const width = vw - SPOT_MARGIN * 2;
    const holeCenter = hole.y + hole.h / 2;
    const visibleCenter = (top0 + vh) / 2;
    // 対象が下半分にあれば上に、上半分にあれば下に出す。
    if (holeCenter > visibleCenter) {
      return { left: SPOT_MARGIN, top: top0, width, side: 'sheet-top', arrow: null };
    }
    return {
      left: SPOT_MARGIN,
      top: Math.max(top0, vh - cardHeight - SPOT_MARGIN),
      width,
      side: 'sheet-bottom',
      arrow: null,
    };
  }

  const width = Math.min(SPOT_CARD_WIDTH, vw - SPOT_MARGIN * 2);
  const centerX = hole.x + hole.w / 2;
  const centerY = hole.y + hole.h / 2;
  const horizontalLeft = clamp(centerX - width / 2, SPOT_MARGIN, vw - width - SPOT_MARGIN);
  const arrowX = clamp(centerX - horizontalLeft, ARROW_EDGE, width - ARROW_EDGE);

  const below = hole.y + hole.h + SPOT_GAP;
  if (below + cardHeight <= vh - SPOT_MARGIN) {
    return { left: horizontalLeft, top: below, width, side: 'bottom', arrow: arrowX };
  }
  const above = hole.y - SPOT_GAP - cardHeight;
  if (above >= top0) {
    return { left: horizontalLeft, top: above, width, side: 'top', arrow: arrowX };
  }

  const verticalTop = clamp(centerY - cardHeight / 2, top0, vh - cardHeight - SPOT_MARGIN);
  const arrowY = clamp(centerY - verticalTop, ARROW_EDGE, cardHeight - ARROW_EDGE);
  const right = hole.x + hole.w + SPOT_GAP;
  if (right + width <= vw - SPOT_MARGIN) {
    return { left: right, top: verticalTop, width, side: 'right', arrow: arrowY };
  }
  const left = hole.x - SPOT_GAP - width;
  if (left >= SPOT_MARGIN) {
    return { left, top: verticalTop, width, side: 'left', arrow: arrowY };
  }

  // 対象が画面いっぱいに大きい: 見えている部分の右下に重ねる。
  const visibleBottom = Math.min(hole.y + hole.h, vh) - SPOT_MARGIN;
  return {
    left: clamp(hole.x + hole.w - width - SPOT_MARGIN, SPOT_MARGIN, vw - width - SPOT_MARGIN),
    top: clamp(visibleBottom - cardHeight, top0, vh - cardHeight - SPOT_MARGIN),
    width,
    side: 'inside',
    arrow: null,
  };
}

/**
 * 対象が見えるようにスクロールする位置（scrollTop）。
 * 収まる対象は見える範囲の中央へ、大きい対象は上端をヘッダーのすぐ下へ。
 */
export function scrollTopToReveal(
  target: Rect,
  current: { scrollTop: number; maxScrollTop: number },
  viewport: Viewport,
): number {
  const visibleTop = viewport.topInset + SPOT_MARGIN;
  const visibleHeight = viewport.h - visibleTop - SPOT_MARGIN;
  // カードを上下に置く余地を少し残すため、6割を超える対象は上寄せにする。
  const delta =
    target.h <= visibleHeight * 0.6
      ? target.y + target.h / 2 - (visibleTop + visibleHeight / 2)
      : target.y - visibleTop - SPOT_PAD;
  return clamp(current.scrollTop + delta, 0, current.maxScrollTop);
}

/** 光らせる範囲の外側を、クリックを受け止める4枚の板に分ける（範囲の中は操作できる） */
export function blockersAround(hole: Rect, vw: number, vh: number): Rect[] {
  const x0 = clamp(hole.x, 0, vw);
  const y0 = clamp(hole.y, 0, vh);
  const x1 = clamp(hole.x + hole.w, 0, vw);
  const y1 = clamp(hole.y + hole.h, 0, vh);
  return [
    { x: 0, y: 0, w: vw, h: y0 },
    { x: 0, y: y1, w: vw, h: vh - y1 },
    { x: 0, y: y0, w: x0, h: y1 - y0 },
    { x: x1, y: y0, w: vw - x1, h: y1 - y0 },
  ].filter((rect) => rect.w > 0 && rect.h > 0);
}

/** ゆっくり動き出して、ゆっくり止まる（0〜1） */
export function easeInOutCubic(progress: number): number {
  const p = clamp(progress, 0, 1);
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

/** 2つの矩形の間を補間する（amount は 0〜1） */
export function lerpRect(from: Rect, to: Rect, amount: number): Rect {
  const lerp = (a: number, b: number) => a + (b - a) * amount;
  return {
    x: lerp(from.x, to.x),
    y: lerp(from.y, to.y),
    w: lerp(from.w, to.w),
    h: lerp(from.h, to.h),
  };
}

/**
 * 次の場所へ移るアニメーションの長さ。近ければ短く、遠ければ少し長くする
 * （どれだけ遠くても間延びしないよう上限を設ける）。
 */
export function flightDurationMs(from: Rect, to: Rect, scrollDistance: number): number {
  const move = Math.hypot(
    to.x + to.w / 2 - (from.x + from.w / 2),
    to.y + to.h / 2 - (from.y + from.h / 2),
  );
  const resize = Math.abs(to.w - from.w) + Math.abs(to.h - from.h);
  const travel = move + resize / 2 + scrollDistance;
  return Math.round(clamp(380 + travel * 0.18, 420, 760));
}
