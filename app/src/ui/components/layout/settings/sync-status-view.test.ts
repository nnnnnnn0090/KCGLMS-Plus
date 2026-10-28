import { describe, expect, it } from 'vitest';
import {
  addPortalSyncEvent,
  EMPTY_PORTAL_SYNC_STATUS,
  type PortalSyncStatus,
} from '../../../../contract/portal-sync-status';
import { SK } from '../../../../contract/storage-keys';
import { jaMessages } from '../../../../domain/i18n/locales/ja';
import { describeEvent, describeSync, summarizeChanges } from './sync-status-view';

const ui = jaMessages.settings.myLinksSyncUi;
const NOW = Date.UTC(2026, 9, 28, 6, 0, 0);
const time = { locale: 'ja', now: NOW };

function view(status: Partial<PortalSyncStatus>, pendingCount = 0, enabled = true) {
  return { enabled, pendingCount, status: { ...EMPTY_PORTAL_SYNC_STATUS, ...status } };
}

describe('sync status in plain words', () => {
  it('says everything matches and when it was checked', () => {
    const state = describeSync(view({ lastSuccessAt: NOW - 3 * 60_000 }), false, true, time, ui);
    expect(state.head).toBe('そろっています');
    expect(state.lines[0]).toMatch(/^3 分前（.+）に確認しました$/);
  });

  it('says how many changes are waiting and when they will be sent', () => {
    const here = describeSync(view({ lastSuccessAt: NOW }, 2), false, true, time, ui);
    expect(here.head).toBe('まだ送っていない変更が 2 件あります');
    expect(here.lines[0]).toBe('すぐに自動で送ります。');
    const elsewhere = describeSync(view({ lastSuccessAt: NOW }, 2), false, false, time, ui);
    expect(elsewhere.lines[0]).toBe('学生ポータルを開くと、自動で送ります。');
  });

  it('explains a failure: why, what happens next, and that nothing is lost', () => {
    const state = describeSync(
      view({ issue: 'network', nextRetryAt: NOW + 30_000, detail: 'load: HTTP 503' }),
      false,
      true,
      time,
      ui,
    );
    expect(state.head).toBe('そろえられませんでした');
    expect(state.lines).toEqual([
      '理由：学校のサーバーにつながりませんでした。',
      '30 秒後にもう一度ためします。',
      'この端末の変更は消えません。',
    ]);
    // 技術的な内容は、本文ではなく折りたたみに入れる。
    expect(state.tech).toBe('load: HTTP 503');
  });

  it('asks a simple question when the two sides differ', () => {
    const state = describeSync(
      view({ issue: 'needs-choice', choice: { kind: 'join', replaced: 3 } }),
      false,
      true,
      time,
      ui,
    );
    expect(state.head).toBe('どちらに合わせますか？');
    expect(state.lines).toEqual([
      'この端末と、ほかの端末で設定がちがいます。',
      'どちらを選んでも、あとで元に戻せます。',
    ]);
  });

  it('says it is off', () => {
    expect(describeSync(view({}, 0, false), false, true, time, ui).head).toBe('オフになっています');
  });
});

describe('recent activity', () => {
  it('lists what was received and sent in everyday words', () => {
    const lines = describeEvent(
      {
        at: NOW,
        kind: 'synced',
        received: { [SK.theme]: 1, [SK.customCalEvents]: 2 },
        sent: { [SK.calendarWeekStart]: 1, [SK.hideProfileName]: 1 },
      },
      ui,
    );
    expect(lines).toEqual([
      'ほかの端末から受け取りました：テーマ、予定 2 件',
      'この端末から送りました：表示の設定',
    ]);
  });

  it('folds repeated failures into one line with a count', () => {
    let history = addPortalSyncEvent([], { at: 1, kind: 'failed', issue: 'network' });
    history = addPortalSyncEvent(history, { at: 2, kind: 'failed', issue: 'network' });
    history = addPortalSyncEvent(history, { at: 3, kind: 'failed', issue: 'network' });
    expect(history).toHaveLength(1);
    expect(describeEvent(history[0], ui)).toEqual([
      '失敗しました：学校のサーバーにつながりませんでした。（3 回）',
    ]);
  });

  it('summarizes display settings once', () => {
    expect(summarizeChanges({ [SK.cplanOverlay]: 1, [SK.home2WebMailOverlay]: 1 }, ui)).toBe(
      '表示の設定',
    );
  });
});
