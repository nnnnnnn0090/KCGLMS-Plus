/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { PORTAL_DOM } from '../contract/dom';
import { syncPortalFont } from './ui-font';

describe('syncPortalFont', () => {
  afterEach(() => {
    document.getElementById(PORTAL_DOM.overlayRoot)?.remove();
    document.getElementById('portal-ui-font-google')?.remove();
    document.getElementById('portal-ui-font-google-preconnect')?.remove();
    document.getElementById('portal-ui-font-google-gstatic')?.remove();
  });

  it('sets --p-font and loads Google Fonts for Zen Maru Gothic', () => {
    const overlay = document.createElement('div');
    overlay.id = PORTAL_DOM.overlayRoot;
    document.body.appendChild(overlay);

    syncPortalFont('zen-maru-gothic');

    expect(overlay.style.getPropertyValue('--p-font')).toContain('Zen Maru Gothic');
    const link = document.getElementById('portal-ui-font-google') as HTMLLinkElement | null;
    expect(link?.rel).toBe('stylesheet');
    expect(link?.href).toContain('fonts.googleapis.com');
    expect(link?.href).toContain('Zen+Maru+Gothic');
  });

  it('switches Google Fonts href when changing fonts', () => {
    const overlay = document.createElement('div');
    overlay.id = PORTAL_DOM.overlayRoot;
    document.body.appendChild(overlay);

    syncPortalFont('zen-maru-gothic');
    syncPortalFont('noto-sans-jp');

    const link = document.getElementById('portal-ui-font-google') as HTMLLinkElement | null;
    expect(link?.href).toContain('Noto+Sans+JP');
    expect(overlay.style.getPropertyValue('--p-font')).toContain('Noto Sans JP');
  });

  it('removes Google Fonts link when returning to default', () => {
    const overlay = document.createElement('div');
    overlay.id = PORTAL_DOM.overlayRoot;
    document.body.appendChild(overlay);

    syncPortalFont('ibm-plex-sans-jp');
    syncPortalFont('default');

    expect(document.getElementById('portal-ui-font-google')).toBeNull();
    expect(overlay.style.getPropertyValue('--p-font')).toContain('Inter');
  });
});
