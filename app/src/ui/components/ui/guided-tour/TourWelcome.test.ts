/** @vitest-environment jsdom */

import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { jaMessages } from '../../../../domain/i18n/locales/ja';
import { TourWelcome } from './TourWelcome';

describe('TourWelcome', () => {
  it('shows what you get, what comes next, and starts or postpones the guide', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onStart = vi.fn();
    const onLater = vi.fn();
    act(() => {
      root.render(
        createElement(TourWelcome, {
          t: jaMessages,
          cardRef: createRef<HTMLDivElement>(),
          onStart,
          onLater,
        }),
      );
    });

    expect(container.querySelector('h2')?.textContent).toBe('毎日のポータルを、もっと使いやすく');
    expect(container.querySelectorAll('.p-tour-welcome-highlights > li')).toHaveLength(4);
    expect(container.querySelectorAll('.p-tour-welcome-flow li')).toHaveLength(2);

    act(() => container.querySelector<HTMLButtonElement>('.p-tour-welcome-start')?.click());
    expect(onStart).toHaveBeenCalledTimes(1);
    act(() => container.querySelector<HTMLButtonElement>('.p-tour-skip')?.click());
    expect(onLater).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
