/**
 * 同じオリジンの全タブで処理を1つずつ実行する排他ロック。
 *
 * Web Locks API が使えればタブをまたいで直列化し、使えなければこのページ内だけで直列化する。
 * Firefox のコンテンツスクリプトでは、ページ側の LockManager が拡張機能側の Promise を
 * 読めず「Permission denied to access property "then"」で失敗するため、最初に一度だけ
 * 実際に使えるかを確かめてから使う。
 */

const localQueues = new Map<string, Promise<unknown>>();

function runInLocalQueue<T>(name: string, task: () => Promise<T>): Promise<T> {
  const previous = localQueues.get(name) ?? Promise.resolve();
  const result = previous.then(task, task);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  localQueues.set(name, settled);
  void settled.then(() => {
    if (localQueues.get(name) === settled) localQueues.delete(name);
  });
  return result;
}

const PROBE_LOCK_NAME = 'kcglms-web-lock-probe';

let usableLocks: Promise<LockManager | null> | null = null;

/** Web Locks がこの実行環境で本当に動くか（Promise を返すコールバックで試す） */
function resolveUsableLocks(): Promise<LockManager | null> {
  if (!usableLocks) {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks || typeof locks.request !== 'function') {
      usableLocks = Promise.resolve(null);
    } else {
      usableLocks = Promise.resolve()
        .then(() => locks.request(PROBE_LOCK_NAME, { ifAvailable: true }, () => Promise.resolve()))
        .then(
          () => locks,
          () => null,
        );
    }
  }
  return usableLocks;
}

/** テスト用: 判定結果を捨てる */
export function resetWebLockForTests(): void {
  usableLocks = null;
  localQueues.clear();
}

export async function withWebLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = await resolveUsableLocks();
  if (!locks) return runInLocalQueue(name, task);
  return locks.request(name, () => task()) as Promise<T>;
}
