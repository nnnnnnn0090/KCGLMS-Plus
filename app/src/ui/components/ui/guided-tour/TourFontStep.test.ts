/** @vitest-environment jsdom */

import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { jaMessages } from '../../../../domain/i18n/locales/ja';
import { UI_FONT_OPTIONS } from '../../../../domain/ui-font';
import { TourFontStep } from './TourFontStep';

describe('TourFontStep', () => {
  it('shows every font in its own lettering, recommends M PLUS, and applies the choice', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSelect = vi.fn();
    act(() => {
      root.render(
        createElement(TourFontStep, {
          stepId: 'font',
          t: jaMessages,
          font: 'mplus-rounded-1c',
          onSelect,
          cardRef: createRef<HTMLDivElement>(),
          dockExiting: false,
          previewGuard: null,
          progress: null,
          actions: null,
        }),
      );
    });

    const options = container.querySelectorAll<HTMLButtonElement>('.p-tour-font-option');
    expect(options).toHaveLength(UI_FONT_OPTIONS.length);
    const active = container.querySelector('.p-tour-font-option.is-active');
    expect(active?.textContent).toContain('M PLUS Rounded 1c');
    expect(active?.textContent).toContain('おすすめ');
    expect(container.textContent).toContain('システム標準');
    // 候補を見比べるためのフォントを読み込む。
    expect(document.getElementById('portal-ui-font-preview')).not.toBeNull();

    // おすすめ（M PLUS）が先頭に並ぶ。
    expect(options[0].textContent).toContain('M PLUS Rounded 1c');
    act(() => options[1].click());
    expect(onSelect).toHaveBeenCalledWith('default');
    act(() => root.unmount());
    expect(document.getElementById('portal-ui-font-preview')).toBeNull();
  });
});
