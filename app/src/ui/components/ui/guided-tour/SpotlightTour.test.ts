/** @vitest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jaMessages } from '../../../../domain/i18n/locales/ja';
import { SpotlightTour } from './SpotlightTour';
import { availableTourStops } from './tour-stops';

/** jsdom はレイアウトしないので、要素ごとに大きさを決めておく */
function sized(el: HTMLElement, rect: { x: number; y: number; w: number; h: number }) {
  el.getBoundingClientRect = () =>
    ({
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.w,
      bottom: rect.y + rect.h,
      width: rect.w,
      height: rect.h,
      x: rect.x,
      y: rect.y,
      toJSON: () => ({}),
    }) as DOMRect;
  return el;
}

function buildHome({ withAssignments }: { withAssignments: boolean }): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <header class="p-header"><nav id="p-site-nav"></nav><button id="p-open-settings"></button></header>
    <section class="p-panel p-panel-cal" data-cal-kind="kogi">
      <div class="p-cal-custom-band-chrome"></div>
    </section>
    ${withAssignments ? '<section id="p-assignment-calendar-panel"><button id="p-assignment-refresh-btn"></button></section>' : ''}
    <section class="p-panel"><div id="p-news"></div></section>
    <section class="p-panel p-panel-links"></section>
  `;
  sized(root, { x: 0, y: 0, w: 1280, h: 800 });
  root.scrollTo = () => undefined;
  root.scrollBy = () => undefined;
  let y = 0;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    sized(el, { x: 40, y, w: 600, h: 120 });
    y += 140;
  }
  return root;
}

describe('home tour stops', () => {
  it('shows every feature that is on the screen, in order', () => {
    const home = buildHome({ withAssignments: true });
    expect(availableTourStops(home).map((stop) => stop.id)).toEqual([
      'nav',
      'kogi',
      'custom',
      'assignment',
      'assignmentRefresh',
      'news',
      'shortcuts',
      'settings',
    ]);
  });

  it('skips features that are hidden (e.g. the assignment calendar)', () => {
    const home = buildHome({ withAssignments: false });
    const ids = availableTourStops(home).map((stop) => stop.id);
    expect(ids).not.toContain('assignment');
    expect(ids).not.toContain('assignmentRefresh');
  });
});

describe('SpotlightTour', () => {
  let container: HTMLElement;
  let root: Root;
  let home: HTMLElement;
  const onBack = vi.fn();
  const onComplete = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    home = buildHome({ withAssignments: true });
    document.body.replaceChildren(home);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onBack.mockReset();
    onComplete.mockReset();
    onClose.mockReset();
    act(() => {
      root.render(
        createElement(SpotlightTour, {
          overlayRoot: home,
          t: jaMessages,
          onBack,
          onComplete,
          onClose,
        }),
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  const title = () => container.querySelector('#p-spot-title')?.textContent;
  const press = (key: string) =>
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key }));
    });
  const click = (selector: string) =>
    act(() => {
      container.querySelector<HTMLButtonElement>(selector)?.click();
    });

  it('points out the button that imports assignments', () => {
    const dots = container.querySelectorAll<HTMLButtonElement>('.p-spot-dot');
    act(() => dots[4].click());
    expect(title()).toBe('課題を取り込む');
    expect(container.textContent).toContain('King LMS');
  });

  it('starts at the top menu and walks forward and back', () => {
    expect(title()).toBe('ポータルの各ページ');
    click('.p-tour-primary');
    expect(title()).toBe('授業カレンダー');
    press('ArrowRight');
    expect(title()).toBe('自分の予定を追加');
    press('ArrowLeft');
    expect(title()).toBe('授業カレンダー');
  });

  it('jumps with the dots and finishes after the last stop', () => {
    const dots = container.querySelectorAll<HTMLButtonElement>('.p-spot-dot');
    expect(dots).toHaveLength(8);
    act(() => dots[7].click());
    expect(title()).toBe('設定');
    click('.p-tour-primary');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('goes back to the setup steps from the first stop, and closes with Esc', () => {
    click('.p-tour-back');
    expect(onBack).toHaveBeenCalledTimes(1);
    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('places the card next to the highlighted area, not over it', () => {
    const card = container.querySelector<HTMLElement>('.p-spot-card');
    const hole = container.querySelector<HTMLElement>('.p-spot-hole');
    expect(hole).not.toBeNull();
    expect(card?.className).toMatch(/is-(bottom|top|right|left)/);
  });
});
