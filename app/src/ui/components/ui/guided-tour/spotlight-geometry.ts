import type { TourStep } from './types';
import type { Hole } from './types';
import { HOLE_PAD, MIN_SPOTLIGHT_EL_PX } from './constants';

export function isSetupDockStep(step: TourStep | undefined): boolean {
  return step?.kind === 'theme' || step?.kind === 'weekStart' || step?.kind === 'character';
}

export function sameHole(a: Hole | null, b: Hole | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function readHole(selector: string, root: Document | HTMLElement): Hole | null {
  const el = root.querySelector(selector);
  if (!(el instanceof HTMLElement)) return null;
  const r = el.getBoundingClientRect();
  if (r.width < MIN_SPOTLIGHT_EL_PX || r.height < MIN_SPOTLIGHT_EL_PX) return null;
  return {
    x: r.left - HOLE_PAD,
    y: r.top - HOLE_PAD,
    w: r.width + HOLE_PAD * 2,
    h: r.height + HOLE_PAD * 2,
  };
}

export function readSpotlightHole(
  step: Extract<TourStep, { kind: 'spotlight' }>,
  root: HTMLElement,
): Hole | null {
  return (
    readHole(step.selector, root) ??
    (step.selectorFallback ? readHole(step.selectorFallback, root) : null)
  );
}

export function querySpotlightElement(
  step: Extract<TourStep, { kind: 'spotlight' }>,
  root: HTMLElement,
): HTMLElement | null {
  const pick = (selector: string): HTMLElement | null => {
    const el = root.querySelector(selector);
    if (!(el instanceof HTMLElement)) return null;
    const r = el.getBoundingClientRect();
    return r.width >= MIN_SPOTLIGHT_EL_PX && r.height >= MIN_SPOTLIGHT_EL_PX ? el : null;
  };
  return pick(step.selector) ?? (step.selectorFallback ? pick(step.selectorFallback) : null);
}

export function scrollSpotlightToOverlayCenter(
  target: HTMLElement,
  scrollRoot: HTMLElement,
  behavior: ScrollBehavior,
): void {
  const rootRect = scrollRoot.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const deltaY = targetRect.top + targetRect.height / 2 - (rootRect.top + rootRect.height / 2);
  const maxTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
  const nextTop = Math.min(maxTop, Math.max(0, scrollRoot.scrollTop + deltaY));
  scrollRoot.scrollTo({ top: nextTop, behavior });
}

export function scrollThemePreviewToCalendar(
  scrollRoot: HTMLElement,
  behavior: ScrollBehavior,
): void {
  const target =
    scrollRoot.querySelector('.p-panel-cal-wrap:has(section[data-cal-kind="kogi"])') ??
    scrollRoot.querySelector('section.p-panel-cal[data-cal-kind="kogi"]');
  if (!(target instanceof HTMLElement)) {
    scrollRoot.scrollTo({ top: 0, left: 0, behavior });
    return;
  }
  const rootRect = scrollRoot.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const header = scrollRoot.querySelector('.p-header');
  const headerBottom =
    header instanceof HTMLElement
      ? Math.max(0, header.getBoundingClientRect().bottom - rootRect.top)
      : 0;
  const topInset = headerBottom + 16;
  const maxTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
  const nextTop = Math.min(
    maxTop,
    Math.max(0, scrollRoot.scrollTop + targetRect.top - rootRect.top - topInset),
  );
  scrollRoot.scrollTo({ top: nextTop, left: 0, behavior });
}

export function computeSpotlightCardCss(
  step: Extract<TourStep, { kind: 'spotlight' }>,
  hole: Hole | null,
  vw: number,
  vh: number,
  cardSize: { w: number; h: number },
  calendarOverviewStepIds: Set<string>,
): string | undefined {
  const margin = 12;
  const gap = 14;
  const width = Math.min(360, vw - margin * 2);
  const height = cardSize.h || 220;
  if (hole && calendarOverviewStepIds.has(step.id)) {
    const inset = 14;
    const calendarWidth = Math.min(width, Math.max(280, hole.w - inset * 2));
    const left = Math.max(
      margin,
      Math.min(hole.x + hole.w - calendarWidth - inset, vw - calendarWidth - margin),
    );
    const top =
      hole.h >= height + inset * 2
        ? Math.max(margin, Math.min(hole.y + hole.h - height - inset, vh - height - margin))
        : Math.max(margin, vh - height - margin);
    return `left:${left}px;top:${top}px;width:${calendarWidth}px`;
  }
  if (!hole) {
    return `left:50%;bottom:12%;width:${width}px;transform:translateX(-50%)`;
  }
  if (step.id === 'shortcuts') {
    const availableLeft = hole.x - gap - margin;
    if (availableLeft >= 240) {
      const shortcutCardWidth = Math.min(width, availableLeft);
      const left = hole.x - gap - shortcutCardWidth;
      const top = Math.max(
        margin,
        Math.min(hole.y + hole.h / 2 - height / 2, vh - height - margin),
      );
      return `left:${left}px;top:${top}px;width:${shortcutCardWidth}px`;
    }
  }

  const below = hole.y + hole.h + gap;
  const top = below + height <= vh - margin ? below : Math.max(margin, hole.y - height - gap);
  const left = Math.max(margin, Math.min(hole.x + hole.w / 2 - width / 2, vw - width - margin));
  return `left:${left}px;top:${top}px;width:${width}px`;
}
