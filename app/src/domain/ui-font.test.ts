import { describe, expect, it } from 'vitest';
import {
  compactUiFont,
  DEFAULT_UI_FONT,
  expandUiFont,
  normalizeUiFont,
  UI_FONT_OPTIONS,
  UI_FONT_STACK,
} from './ui-font';

describe('normalizeUiFont', () => {
  it('accepts known ids', () => {
    expect(normalizeUiFont('default')).toBe('default');
    expect(normalizeUiFont('zen-maru-gothic')).toBe('zen-maru-gothic');
    expect(normalizeUiFont('noto-sans-jp')).toBe('noto-sans-jp');
    expect(normalizeUiFont('ibm-plex-sans-jp')).toBe('ibm-plex-sans-jp');
  });

  it('falls back to default for invalid values', () => {
    expect(normalizeUiFont(undefined)).toBe(DEFAULT_UI_FONT);
    expect(normalizeUiFont(null)).toBe(DEFAULT_UI_FONT);
    expect(normalizeUiFont('')).toBe(DEFAULT_UI_FONT);
    expect(normalizeUiFont('comic-sans')).toBe(DEFAULT_UI_FONT);
  });

  it('exposes stacks and options for google fonts', () => {
    expect(UI_FONT_STACK.default).toContain('Inter');
    expect(UI_FONT_STACK['zen-maru-gothic']).toContain('Zen Maru Gothic');
    expect(UI_FONT_STACK['noto-sans-jp']).toContain('Noto Sans JP');
    expect(UI_FONT_OPTIONS.length).toBeGreaterThan(3);
  });
});

describe('compactUiFont / expandUiFont', () => {
  it('omits default and round-trips google fonts', () => {
    expect(compactUiFont('default')).toBeUndefined();
    expect(compactUiFont('zen-maru-gothic')).toBe('z');
    expect(compactUiFont('noto-sans-jp')).toBe('n');
    expect(expandUiFont('z')).toBe('zen-maru-gothic');
    expect(expandUiFont('n')).toBe('noto-sans-jp');
    expect(expandUiFont('noto-sans-jp')).toBe('noto-sans-jp');
    expect(expandUiFont('nope')).toBe('default');
  });
});
