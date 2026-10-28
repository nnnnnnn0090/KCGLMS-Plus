/**
 * 初期設定の手順で、テーマなどの見え方を確かめやすい位置へスクロールする。
 */

import type { TourStep } from './types';

/** 下のドックに出す初期設定の手順 */
export function isSetupDockStep(step: TourStep | undefined): boolean {
  return (
    step?.kind === 'theme' ||
    step?.kind === 'font' ||
    step?.kind === 'weekStart' ||
    step?.kind === 'character' ||
    step?.kind === 'sync'
  );
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
