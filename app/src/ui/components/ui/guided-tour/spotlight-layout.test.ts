import { describe, expect, it } from 'vitest';
import {
  blockersAround,
  easeInOutCubic,
  flightDurationMs,
  lerpRect,
  placeSpotlightCard,
  scrollTopToReveal,
  SPOT_GAP,
  SPOT_MARGIN,
} from './spotlight-layout';

const desktop = { w: 1280, h: 800, topInset: 64 };

function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('placeSpotlightCard', () => {
  it('puts the card below a small target, with the arrow pointing at it', () => {
    const hole = { x: 900, y: 80, w: 120, h: 40 };
    const card = placeSpotlightCard(hole, 220, desktop);
    expect(card.side).toBe('bottom');
    expect(card.top).toBe(hole.y + hole.h + SPOT_GAP);
    expect(card.left + (card.arrow ?? 0)).toBeCloseTo(hole.x + hole.w / 2, 0);
  });

  it('goes above when there is no room below', () => {
    const card = placeSpotlightCard({ x: 300, y: 600, w: 300, h: 120 }, 220, desktop);
    expect(card.side).toBe('top');
  });

  it('goes beside a tall target', () => {
    const card = placeSpotlightCard({ x: 40, y: 80, w: 600, h: 680 }, 220, desktop);
    expect(card.side).toBe('right');
  });

  it('never covers the target unless the target fills the screen', () => {
    for (const hole of [
      { x: 20, y: 90, w: 300, h: 60 },
      { x: 900, y: 650, w: 300, h: 100 },
      { x: 500, y: 300, w: 200, h: 200 },
      { x: 30, y: 100, w: 1100, h: 400 },
    ]) {
      const card = placeSpotlightCard(hole, 240, desktop);
      if (card.side === 'inside') continue;
      expect(overlaps(hole, { x: card.left, y: card.top, w: card.width, h: 240 })).toBe(false);
    }
  });

  it('keeps the card on screen', () => {
    const card = placeSpotlightCard({ x: 1200, y: 70, w: 70, h: 40 }, 260, desktop);
    expect(card.left + card.width).toBeLessThanOrEqual(desktop.w - SPOT_MARGIN);
    expect(card.left).toBeGreaterThanOrEqual(SPOT_MARGIN);
  });

  it('overlaps a huge target in its visible corner', () => {
    const card = placeSpotlightCard({ x: 0, y: 40, w: 1280, h: 1400 }, 240, desktop);
    expect(card.side).toBe('inside');
    expect(card.top + 240).toBeLessThanOrEqual(desktop.h - SPOT_MARGIN);
  });

  it('uses a sheet on phones, on the side away from the target', () => {
    const phone = { w: 390, h: 800, topInset: 56 };
    expect(placeSpotlightCard({ x: 10, y: 100, w: 370, h: 200 }, 260, phone).side).toBe(
      'sheet-bottom',
    );
    expect(placeSpotlightCard({ x: 10, y: 560, w: 370, h: 200 }, 260, phone).side).toBe(
      'sheet-top',
    );
  });
});

describe('scrollTopToReveal', () => {
  it('centers a target that fits', () => {
    const next = scrollTopToReveal(
      { x: 0, y: 1500, w: 400, h: 200 },
      { scrollTop: 0, maxScrollTop: 5000 },
      desktop,
    );
    const visibleTop = desktop.topInset + SPOT_MARGIN;
    const center = visibleTop + (desktop.h - visibleTop - SPOT_MARGIN) / 2;
    expect(1500 + 100 - next).toBeCloseTo(center, 0);
  });

  it('aligns a tall target under the header and stays within the page', () => {
    expect(
      scrollTopToReveal(
        { x: 0, y: 900, w: 400, h: 700 },
        { scrollTop: 0, maxScrollTop: 5000 },
        desktop,
      ),
    ).toBeGreaterThan(0);
    expect(
      scrollTopToReveal(
        { x: 0, y: 900, w: 400, h: 700 },
        { scrollTop: 0, maxScrollTop: 100 },
        desktop,
      ),
    ).toBe(100);
  });
});

describe('blockersAround', () => {
  it('leaves the highlighted area usable and blocks the rest', () => {
    const hole = { x: 100, y: 100, w: 200, h: 100 };
    const blockers = blockersAround(hole, 800, 600);
    const area = blockers.reduce((sum, rect) => sum + rect.w * rect.h, 0);
    expect(area).toBe(800 * 600 - 200 * 100);
    for (const rect of blockers) expect(overlaps(rect, hole)).toBe(false);
  });
});

describe('moving between stops', () => {
  it('eases from start to end and lands exactly on the target', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    const to = { x: 10, y: 20, w: 30, h: 40 };
    expect(lerpRect({ x: 0, y: 0, w: 0, h: 0 }, to, 1)).toEqual(to);
  });

  it('keeps the move short for nearby stops and capped for far ones', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    expect(flightDurationMs(a, a, 0)).toBe(420);
    expect(flightDurationMs(a, { x: 0, y: 3000, w: 100, h: 100 }, 3000)).toBe(760);
  });
});
