/**
 * King LMS 同期状態機械（§10.3）。
 * states = idle / pendingCourse / awaitCourseLogin / pendingAssignment / awaitCalendarLogin / done / timeout / error
 */

export type SyncMachineState =
  | 'idle'
  | 'pendingCourse'
  | 'awaitCourseLogin'
  | 'pendingAssignment'
  | 'awaitCalendarLogin'
  | 'done'
  | 'timeout'
  | 'error';

export type SyncMachineEvent =
  | 'start'
  | 'loginInterrupt'
  | 'captured'
  | 'flushed'
  | 'timeout'
  | 'abort';

export type SyncKind = 'course' | 'assignment';

export interface SyncMachineContext {
  state: SyncMachineState;
  kind?: SyncKind;
}

const TRANSITIONS: Record<SyncMachineState, Partial<Record<SyncMachineEvent, SyncMachineState>>> = {
  idle: {
    start: 'pendingCourse',
  },
  pendingCourse: {
    loginInterrupt: 'awaitCourseLogin',
    captured: 'pendingCourse',
    flushed: 'done',
    timeout: 'timeout',
    abort: 'idle',
  },
  awaitCourseLogin: {
    start: 'pendingCourse',
    loginInterrupt: 'awaitCourseLogin',
    abort: 'idle',
  },
  pendingAssignment: {
    loginInterrupt: 'awaitCalendarLogin',
    captured: 'pendingAssignment',
    flushed: 'done',
    timeout: 'timeout',
    abort: 'idle',
  },
  awaitCalendarLogin: {
    start: 'pendingAssignment',
    loginInterrupt: 'awaitCalendarLogin',
    abort: 'idle',
  },
  done: {
    start: 'pendingCourse',
  },
  timeout: {
    start: 'pendingCourse',
  },
  error: {
    start: 'pendingAssignment',
  },
};

export function initialSyncMachine(): SyncMachineContext {
  return { state: 'idle' };
}

export function transitionSyncMachine(
  ctx: SyncMachineContext,
  event: SyncMachineEvent,
  kind?: SyncKind,
): SyncMachineContext {
  if (event === 'start' && kind) {
    const nextState: SyncMachineState = kind === 'course' ? 'pendingCourse' : 'pendingAssignment';
    return { state: nextState, kind };
  }

  const table = TRANSITIONS[ctx.state];
  const next = table[event];
  if (!next) return ctx;
  return { state: next, kind: ctx.kind ?? kind };
}

export function isSyncActive(state: SyncMachineState): boolean {
  return (
    state === 'pendingCourse' ||
    state === 'awaitCourseLogin' ||
    state === 'pendingAssignment' ||
    state === 'awaitCalendarLogin'
  );
}
