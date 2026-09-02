/** @vitest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { SK } from '../contract/storage-keys';
import type { CustomCalEventDraft } from '../domain/custom-cal-events';
import { installChromeStorageMock } from '../platform/storage/chrome-storage-client.test-support';
import { CustomCalEventsProvider, useCustomCalEvents } from './custom-cal-events';
import { SettingsProvider } from './settings';

let stored: Record<string, unknown>;

describe('CustomCalEventsProvider', () => {
  beforeEach(() => {
    stored = {};
    installChromeStorageMock(stored);
    document.head.replaceChildren();
    document.body.replaceChildren();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  });

  it('returns the updated event synchronously and persists the same collection', async () => {
    let addEvent: ((input: CustomCalEventDraft) => { id: string } | null) | undefined;
    let updateEvent:
      | ((id: string, input: CustomCalEventDraft) => { title: string } | null)
      | undefined;

    function Probe() {
      const context = useCustomCalEvents();
      addEvent = context.addEvent;
      updateEvent = context.updateEvent;
      return createElement('output', null, context.events.length);
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          SettingsProvider,
          null,
          createElement(CustomCalEventsProvider, null, createElement(Probe)),
        ),
      );
    });

    let created: { id: string } | null = null;
    await act(async () => {
      created =
        addEvent?.({
          title: 'バイト',
          kind: 'recurring',
          weekday: 1,
        }) ?? null;
    });
    expect(created).not.toBeNull();

    let updated: { title: string } | null = null;
    await act(async () => {
      updated =
        updateEvent?.(created!.id, {
          title: 'アルバイト',
          kind: 'once',
          date: '2026-07-06',
        }) ?? null;
    });

    expect(updated).toEqual(expect.objectContaining({ title: 'アルバイト' }));
    expect(stored[SK.customCalEvents]).toMatchObject({
      schemaVersion: 1,
      events: [{ id: created!.id, title: 'アルバイト', date: '2026-07-06' }],
    });

    await act(async () => root.unmount());
  });
});
