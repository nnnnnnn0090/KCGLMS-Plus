import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../../domain/settings';
import { DEFAULT_THEME, THEMES } from '../../../../domain/themes';
import {
  EXISTING_SYNC_STEP_ID,
  PROGRESS_WIDTH_CLASS,
  RECOMMENDED_THEME_KEYS,
  STEPS,
  tourSteps,
} from './constants';

describe('first-run tutorial', () => {
  it('asks about sync after the other first-run settings', () => {
    const ids = STEPS.map((step) => step.id);
    expect(ids).toEqual(['welcome', 'theme', 'font', 'week-start', 'character', 'sync']);
  });

  it('asks about sync right after the welcome only when existing settings are on the portal', () => {
    expect(tourSteps(false)).toBe(STEPS);
    expect(tourSteps(true).map((step) => step.id)).toEqual([
      'welcome',
      EXISTING_SYNC_STEP_ID,
      'theme',
      'font',
      'week-start',
      'character',
    ]);
    expect(tourSteps(true)).toHaveLength(STEPS.length);
  });

  it('has a progress width for every setup step', () => {
    for (let index = 1; index <= STEPS.length; index += 1) {
      expect(PROGRESS_WIDTH_CLASS[`${index}/${STEPS.length}`]).toBeDefined();
    }
  });

  it('defaults to the powder theme and recommends it first', () => {
    expect(DEFAULT_THEME).toBe('powder');
    expect(THEMES[DEFAULT_THEME]).toBeDefined();
    expect(DEFAULT_SETTINGS.theme).toBe('powder');
    expect(RECOMMENDED_THEME_KEYS[0]).toBe('powder');
    for (const key of RECOMMENDED_THEME_KEYS) expect(THEMES[key]).toBeDefined();
  });
});
