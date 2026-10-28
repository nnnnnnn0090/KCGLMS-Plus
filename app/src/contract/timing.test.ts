import { describe, expect, it } from 'vitest';
import { PORTAL_API_RESPONSE_DEADLINE_MS, pageFetchRetryDelayMs, TIMING } from './timing';

describe('portal API response deadline', () => {
  it('outlasts the page bridge waiting for auth headers and retrying 401s', () => {
    // ブリッジ側の最悪ケース: 認証ヘッダー待ち + 401 の再試行をすべて使い切る。
    let bridgeWorstCase = TIMING.pageFetchDeadlineMs;
    for (let attempt = 0; attempt < TIMING.pageFetchMaxAttempts; attempt += 1) {
      bridgeWorstCase += pageFetchRetryDelayMs(attempt);
    }
    // 呼び出し側が先に諦めると「通信できない」と誤表示し、遅れて保存が実行されてしまう。
    expect(PORTAL_API_RESPONSE_DEADLINE_MS).toBeGreaterThan(bridgeWorstCase + 10_000);
  });
});
