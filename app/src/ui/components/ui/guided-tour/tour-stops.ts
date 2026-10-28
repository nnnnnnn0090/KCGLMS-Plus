/**
 * ホームの案内で順に光らせる場所。
 * 画面にないもの（非表示にした課題カレンダー、使えない「みんなの活動」など）は始める前に除く。
 */

export type TourStopId =
  | 'nav'
  | 'kogi'
  | 'custom'
  | 'assignment'
  | 'assignmentRefresh'
  | 'news'
  | 'shortcuts'
  | 'community'
  | 'settings';

export interface TourStop {
  id: TourStopId;
  /** 上から順に試し、最初に見つかった要素を光らせる */
  selectors: readonly string[];
}

const KOGI_PANEL = 'section.p-panel-cal[data-cal-kind="kogi"]';

export const TOUR_STOPS: readonly TourStop[] = [
  { id: 'nav', selectors: ['#p-site-nav'] },
  {
    id: 'kogi',
    selectors: [`.p-panel-cal-wrap:has(${KOGI_PANEL})`, KOGI_PANEL],
  },
  { id: 'custom', selectors: [`${KOGI_PANEL} .p-cal-custom-band-chrome`] },
  { id: 'assignment', selectors: ['#p-assignment-calendar-panel'] },
  { id: 'assignmentRefresh', selectors: ['#p-assignment-refresh-btn'] },
  { id: 'news', selectors: ['section.p-panel:has(#p-news)', '#p-news'] },
  { id: 'shortcuts', selectors: ['section.p-panel.p-panel-links', '#p-links'] },
  { id: 'community', selectors: ['.p-community-activity-entry'] },
  { id: 'settings', selectors: ['#p-open-settings'] },
];

/** これより小さい要素は「見えていない」とみなす */
const MIN_SIZE_PX = 2;

function isVisible(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  return rect.width >= MIN_SIZE_PX && rect.height >= MIN_SIZE_PX;
}

export function findStopTarget(stop: TourStop, root: ParentNode): HTMLElement | null {
  for (const selector of stop.selectors) {
    let el: Element | null = null;
    try {
      el = root.querySelector(selector);
    } catch {
      // `:has()` に対応していないブラウザでは次の候補を使う。
      continue;
    }
    if (el && isVisible(el)) return el;
  }
  return null;
}

/** 今の画面で案内できる場所だけを残す */
export function availableTourStops(root: ParentNode): TourStop[] {
  return TOUR_STOPS.filter((stop) => findStopTarget(stop, root) !== null);
}
