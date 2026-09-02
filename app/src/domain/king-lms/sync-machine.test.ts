import { describe, expect, it } from 'vitest';
import { initialSyncMachine, isSyncActive, transitionSyncMachine } from './sync-machine';

describe('sync-machine', () => {
  it('starts course sync from idle', () => {
    const next = transitionSyncMachine(initialSyncMachine(), 'start', 'course');
    expect(next).toEqual({ state: 'pendingCourse', kind: 'course' });
    expect(isSyncActive(next.state)).toBe(true);
  });

  it('handles login interrupt during course sync', () => {
    const pending = transitionSyncMachine(initialSyncMachine(), 'start', 'course');
    const interrupted = transitionSyncMachine(pending, 'loginInterrupt');
    expect(interrupted.state).toBe('awaitCourseLogin');
  });

  it('completes course sync on flush', () => {
    const pending = transitionSyncMachine(initialSyncMachine(), 'start', 'course');
    const done = transitionSyncMachine(pending, 'flushed');
    expect(done.state).toBe('done');
    expect(isSyncActive(done.state)).toBe(false);
  });

  it('starts assignment sync from done', () => {
    const done = transitionSyncMachine(initialSyncMachine(), 'start', 'course');
    const flushed = transitionSyncMachine(done, 'flushed');
    const assignment = transitionSyncMachine(flushed, 'start', 'assignment');
    expect(assignment).toEqual({ state: 'pendingAssignment', kind: 'assignment' });
  });
});
