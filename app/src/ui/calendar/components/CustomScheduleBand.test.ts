/** @vitest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import { CustomScheduleBand, type CustomBandSwipeSignal } from './CustomScheduleBand';

vi.mock('../../../context/settings', () => ({
  useSettings: () => ({ settings: { language: 'ja' } }),
}));

describe('CustomScheduleBand', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('commits a swipe and removes the transitional two-week track', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const renderBand = (swipeSignal: CustomBandSwipeSignal | null) =>
      createElement(
        I18nProvider,
        null,
        createElement(CustomScheduleBand, {
          rangeStart: '2026-07-20',
          rangeEnd: '2026-07-27',
          weekStart: 'monday',
          events: [],
          collapsed: false,
          onCollapsedChange: () => undefined,
          swipeSignal,
          todayIso: '2026-07-20',
          onAdd: () => undefined,
          onSelect: () => undefined,
        }),
      );

    await act(async () => root.render(renderBand(null)));
    await act(async () =>
      root.render(
        renderBand({
          key: 1,
          dir: 'next',
          from: { start: '2026-07-20', end: '2026-07-27' },
          to: { start: '2026-07-27', end: '2026-08-03' },
        }),
      ),
    );
    expect(container.querySelector('.p-cal-swipe-track')).not.toBeNull();

    await act(async () => vi.advanceTimersByTime(600));
    expect(container.querySelector('.p-cal-swipe-track')).toBeNull();
    expect(container.querySelectorAll('.p-cal-custom-band-cell')).toHaveLength(7);

    await act(async () => root.unmount());
  });
});
