import { describe, expect, it } from 'vitest';
import { KING_LMS_HOOK } from '../../contract/messages';
import { isPageMessage } from './types';

describe('isPageMessage King LMS progress', () => {
  const base = { type: KING_LMS_HOOK.assignmentProgressType, source: KING_LMS_HOOK.source };

  it('段階が calendar / status のものだけ通す', () => {
    expect(isPageMessage({ ...base, step: 'calendar' })).toBe(true);
    expect(isPageMessage({ ...base, step: 'status', done: 1, total: 4 })).toBe(true);
    expect(isPageMessage({ ...base, step: 'other' })).toBe(false);
    expect(isPageMessage({ ...base, source: 'x', step: 'calendar' })).toBe(false);
  });
});
