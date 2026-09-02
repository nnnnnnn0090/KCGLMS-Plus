/** @vitest-environment jsdom */

import { act, createElement, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDialogFocusTrap } from './use-dialog-behavior';

describe('useDialogFocusTrap', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  });

  it('returns focus to the opener even when the dialog focuses itself on mount', async () => {
    const opener = document.createElement('button');
    const container = document.createElement('div');
    document.body.append(opener, container);
    opener.focus();

    function Dialog() {
      const rootRef = useRef<HTMLDivElement>(null);
      const inputRef = useRef<HTMLInputElement>(null);
      useEffect(() => inputRef.current?.focus(), []);
      useDialogFocusTrap(rootRef, () => undefined);
      return createElement('div', { ref: rootRef }, createElement('input', { ref: inputRef }));
    }

    const root = createRoot(container);
    await act(async () => root.render(createElement(Dialog)));
    expect(document.activeElement).toBe(container.querySelector('input'));

    await act(async () => root.unmount());
    expect(document.activeElement).toBe(opener);
  });
});
