import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetWebLockForTests, withWebLock } from './web-lock';

/** Firefox のコンテンツスクリプトと同じく、コールバックが返す Promise を読めない LockManager */
function firefoxLikeLocks() {
  return {
    request: vi.fn(async (...args: unknown[]) => {
      const callback = args[args.length - 1] as () => unknown;
      const value = callback();
      if (value && typeof value === 'object') {
        throw new Error('Permission denied to access property "then"');
      }
      return value;
    }),
  };
}

function workingLocks() {
  const queue: Promise<unknown>[] = [];
  return {
    request: vi.fn((...args: unknown[]) => {
      const callback = args[args.length - 1] as () => Promise<unknown>;
      const previous = queue.at(-1) ?? Promise.resolve();
      const run = previous.then(() => callback());
      queue.push(run.catch(() => undefined));
      return run;
    }),
  };
}

describe('withWebLock', () => {
  beforeEach(() => resetWebLockForTests());
  afterEach(() => vi.unstubAllGlobals());

  it('falls back to a per-page queue when Web Locks cannot be used (Firefox content scripts)', async () => {
    const locks = firefoxLikeLocks();
    vi.stubGlobal('navigator', { locks });
    const task = vi.fn(async () => 'done');

    await expect(withWebLock('links', task)).resolves.toBe('done');
    await expect(withWebLock('links', task)).resolves.toBe('done');
    // 本番の処理は Web Locks に渡さず、ちょうど1回ずつ実行される。
    expect(task).toHaveBeenCalledTimes(2);
    expect(locks.request).toHaveBeenCalledTimes(1);
  });

  it('runs tasks one at a time in the fallback queue', async () => {
    vi.stubGlobal('navigator', { locks: firefoxLikeLocks() });
    const order: string[] = [];
    let release: () => void = () => undefined;
    const first = withWebLock('links', async () => {
      order.push('first:start');
      await new Promise<void>((resolve) => (release = resolve));
      order.push('first:end');
    });
    const second = withWebLock('links', async () => {
      order.push('second');
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it('uses Web Locks when they work', async () => {
    const locks = workingLocks();
    vi.stubGlobal('navigator', { locks });
    await expect(withWebLock('links', async () => 42)).resolves.toBe(42);
    expect(locks.request).toHaveBeenCalledWith('links', expect.any(Function));
  });
});
