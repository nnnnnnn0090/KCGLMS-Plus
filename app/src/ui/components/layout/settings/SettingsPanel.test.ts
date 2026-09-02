/** @vitest-environment jsdom */

import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../../domain/settings';
import type { SettingsPanelHandle } from './SettingsPanel';

vi.mock('../../../../i18n', () => ({
  useI18n: () => ({
    t: {
      settings: {
        about: 'About',
        openLicenses: 'Licenses',
        openPrivacyPolicy: 'Privacy',
        title: 'Settings',
        general: 'General',
        connections: 'Connections',
        support: 'Support',
        version: (version: string) => version,
      },
    },
  }),
}));

vi.mock('../../../../hooks/useExtensionUpdateAvailable', () => ({
  useExtensionUpdateAvailable: () => ({
    latestVersion: null,
    updateAvailable: false,
  }),
}));

vi.mock('../../../../lib/extension-version', () => ({
  readExtensionVersion: () => null,
}));

vi.mock('./SettingsPanelSections', () => ({
  SettingsFeedbackSection: () => null,
  SettingsCplanSection: () => null,
  SettingsHome2ChangelogSection: () => null,
  SettingsLanguageSection: () => null,
  SettingsPortalOnlySections: () => null,
  SettingsThemeSection: () => null,
  SettingsWebMailSection: () => null,
}));

vi.mock('./SettingsFontSection', () => ({
  SettingsFontSection: () => null,
}));

vi.mock('./SettingsChangelogModal', () => ({
  SettingsChangelogModal: () => null,
}));

vi.mock('./SettingsLicensesModal', () => ({
  SettingsLicensesModal: () => null,
}));

vi.mock('./ThemeStudio', () => ({
  ThemeStudio: () => null,
}));

vi.mock('./settings-popover-layout', () => ({
  clearSettingsPopoverLayout: () => undefined,
  layoutSettingsPopover: () => undefined,
}));

import { SettingsPanel } from './SettingsPanel';

let reducedMotion = false;

describe('SettingsPanel close animation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reducedMotion = false;
    document.body.replaceChildren();
    Object.assign(globalThis, {
      IS_REACT_ACT_ENVIRONMENT: true,
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: reducedMotion,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    {
      reduced: false,
      duration: 240,
    },
    {
      reduced: true,
      duration: 140,
    },
  ])(
    'animates the visible dialog before unmounting it (reduced motion: $reduced)',
    async ({ reduced, duration }) => {
      reducedMotion = reduced;
      const overlay = document.createElement('div');
      overlay.id = 'portal-overlay';
      const anchor = document.createElement('button');
      anchor.id = 'p-open-settings';
      const container = document.createElement('div');
      document.body.append(overlay, anchor, container);

      const panelRef = createRef<SettingsPanelHandle>();
      const onClose = vi.fn();
      const root = createRoot(container);
      await act(async () => {
        root.render(
          createElement(SettingsPanel, {
            ref: panelRef,
            isOpen: true,
            settings: DEFAULT_SETTINGS,
            onClose,
            onThemeChange: () => undefined,
            onSettingChange: () => undefined,
            onReplayGuidedTour: () => undefined,
            variant: 'home2',
          }),
        );
      });

      const dialog = document.querySelector<HTMLElement>('.p-settings-dialog');
      expect(dialog).not.toBeNull();

      let renderFrame: FrameRequestCallback = () => undefined;
      vi.spyOn(performance, 'now').mockReturnValue(1_000);
      const requestFrame = vi
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          renderFrame = callback;
          return 1;
        });
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

      await act(async () => panelRef.current?.requestClose());

      expect(requestFrame).toHaveBeenCalledTimes(1);
      expect(dialog?.style.opacity).toBe('1');
      expect(document.getElementById('p-settings-pop')?.classList.contains('is-closing')).toBe(
        true,
      );
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => renderFrame(1_000 + duration / 2));
      expect(Number(dialog?.style.opacity)).toBeGreaterThan(0);
      expect(Number(dialog?.style.opacity)).toBeLessThan(1);
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => renderFrame(1_000 + duration));
      expect(dialog?.style.opacity).toBe('0');
      expect(onClose).toHaveBeenCalledTimes(1);

      await act(async () => root.unmount());
    },
  );
});
