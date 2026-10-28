/**
 * - language: 言語の選択
 * - tour: 初期設定（テーマ・フォント・週の始まり・キャラクター・同期）
 * - spotlight: ホームの案内（周りを暗くして機能を1つずつ紹介）
 * - done: 完了のカード
 */
export type TourPhase = 'loading' | 'language' | 'tour' | 'spotlight' | 'done' | 'off';

export interface TourStep {
  kind: 'welcome' | 'theme' | 'font' | 'weekStart' | 'character' | 'sync' | 'done';
  id: string;
}

export interface GuidedTourProps {
  route: import('../../../../domain/portal/router').PortalRoute;
  settingsReady: boolean;
  /** 課題カレンダーを隠しているか（隠していれば案内でも飛ばす） */
  hideAssignmentCalendar?: boolean;
  guidedTourReplayToken?: number;
}
