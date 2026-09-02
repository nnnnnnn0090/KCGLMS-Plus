import { describe, expect, it } from 'vitest';
import { assignmentStatusLabel, resolveAssignmentDisplayStatus } from './assignment';

describe('resolveAssignmentDisplayStatus', () => {
  const now = Date.parse('2026-06-20T12:00:00.000Z');

  it('returns submitted when gradebook says submitted', () => {
    expect(resolveAssignmentDisplayStatus(true, '2026-06-10T00:00:00.000Z', now)).toBe('submitted');
  });

  it('returns pending when not submitted and before due', () => {
    expect(resolveAssignmentDisplayStatus(false, '2026-06-28T00:00:00.000Z', now)).toBe('pending');
  });

  it('returns overdue when not submitted and past due', () => {
    expect(resolveAssignmentDisplayStatus(false, '2026-06-10T00:00:00.000Z', now)).toBe('overdue');
  });

  it('returns unknown when submission state is missing', () => {
    expect(resolveAssignmentDisplayStatus(undefined, '2026-06-10T00:00:00.000Z', now)).toBe(
      'unknown',
    );
  });
});

describe('assignmentStatusLabel', () => {
  it('maps display status to localized labels', () => {
    expect(assignmentStatusLabel('submitted', 'ja')).toBe('提出済み');
    expect(assignmentStatusLabel('pending', 'ja')).toBe('未提出');
    expect(assignmentStatusLabel('overdue', 'ja')).toBe('期限切れ');
    expect(assignmentStatusLabel('unknown', 'ja')).toBe('');
  });
});
