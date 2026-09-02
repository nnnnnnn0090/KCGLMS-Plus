/**
 * カレンダー機能で共有する型定義です（API パラメータ・イベント・描画メタ情報）。
 */

import type { CalendarWeekStart } from '../../lib/date';
import type { AppLanguage } from '../../i18n/messages';
import type { CustomCalEvent } from '../../domain/custom-cal-events';

/** カレンダー API リクエストの uKbn + 半開区間 [start, end) */
export interface CalParams {
  uKbn: string;
  start: string;
  end: string;
}

/** カレンダーイベント（KogiCalendar / HoshuCalendar など） */
export interface CalEvent {
  title?: string;
  tooltip?: string;
  href?: string;
  calMeta?: string;
  calTime?: string;
  /** ISO 8601 日時文字列。API によっては日時まで含む場合がある */
  start?: string;
  /** 課題カレンダー: gradebook user status から取得。未設定は判定不能（バッジ非表示） */
  assignmentSubmitted?: boolean;
  /** 追加予定（月表示の日セル用）。設定時は data-cal-kind=custom で描画 */
  customEventId?: string;
}

/** グリッド描画時の表示オプション */
export interface ViewMeta {
  mode: 'week' | 'month';
  monthRef: { y: number; m: number } | null;
  /** 授業カレンダー（kogi）で King LMS コース URL の解決に使う */
  kingLmsCourses: Array<{ displayName?: string; externalAccessUrl?: string }>;
  calKind: string;
  /** 週列の左端。`range` の `start` 日の曜日と一致すること */
  weekStart: CalendarWeekStart;
  /** グリッド内固定文言の表示言語 */
  language?: AppLanguage;
  /** プロモーションデモ等で「今日」の表示日を差し替える */
  todayIso?: string;
  /** 課題ステータス判定に使う現在時刻 */
  nowMs?: number;
  /**
   * 授業カレンダー月表示の日セルへ差し込む追加予定。
   * 週表示は帯 UI のみ（ここではマージしない）。
   */
  customEvents?: readonly CustomCalEvent[];
}
