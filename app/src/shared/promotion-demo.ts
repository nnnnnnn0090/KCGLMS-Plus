import type { DuePayload } from '../ui/calendar';
import type { CalEvent } from '../ui/calendar/types';
import { addDaysIso, toIsoLocal } from '../lib/date';
import type { NewsListItem } from './types';

/** プロモーション撮影用。公開ビルドでは必ず false にする。 */
export const PROMOTION_DEMO_MODE = false;

function day(offset: number): string {
  return addDaysIso(toIsoLocal(new Date()), offset);
}

function currentMonday(): string {
  const now = new Date();
  const offset = -((now.getDay() + 6) % 7);
  return addDaysIso(toIsoLocal(now), offset);
}

export function promotionDemoTodayIso(): string {
  return addDaysIso(currentMonday(), 3);
}

const DEMO_COURSES = [
  ['Webプログラミング演習【駅前校】', 'A301'],
  ['データベース概論【駅前校】', 'A402'],
  ['情報セキュリティ【駅前校】', 'B201'],
  ['プロジェクト演習【駅前校】', 'A501'],
  ['ネットワーク技術【駅前校】', 'B305'],
  ['キャリアデザイン【駅前校】', 'A201'],
  ['アルゴリズム基礎【駅前校】', 'A302'],
  ['システム設計演習【駅前校】', 'B401'],
] as const;

export function createPromotionDemoKogiCalendar(): CalEvent[] {
  const monday = currentMonday();
  const events: CalEvent[] = [];
  const weeklyPeriods = [
    [1, 2, 3, 4],
    [1, 2, 4],
    [1, 2, 3],
    [1, 2, 3, 4, 5],
    [1, 2, 3, 5],
  ] as const;

  weeklyPeriods.forEach((periods, weekday) => {
    periods.forEach((period, index) => {
      const course = DEMO_COURSES[(weekday * 3 + period + index) % DEMO_COURSES.length];
      events.push({
        title: `${period} ${course[0]}`,
        tooltip: `時限：${period}<br>教室：${course[1]}`,
        start: addDaysIso(monday, weekday),
      });
    });
  });

  return events;
}

export function createPromotionDemoAssignments(): DuePayload {
  const monday = currentMonday();
  const due = (weekday: number, time = '23:59') =>
    `${addDaysIso(monday, weekday)}T${time}:00+09:00`;
  const pendingToday = `${promotionDemoTodayIso()}T23:59:00+09:00`;

  return {
    capturedAt: Date.now(),
    items: [
      {
        courseId: 'demo-1',
        courseName: 'Webプログラミング演習【駅前校】',
        title: 'HTML/CSS演習課題',
        dueDate: due(0, '17:00'),
        sourceId: 'demo-task-1',
        submitted: true,
      },
      {
        courseId: 'demo-2',
        courseName: 'データベース概論【駅前校】',
        title: 'ER図の作成',
        dueDate: due(0),
        sourceId: 'demo-task-2',
        submitted: false,
      },
      {
        courseId: 'demo-3',
        courseName: '情報セキュリティ【駅前校】',
        title: '確認テスト 第6回',
        dueDate: due(1, '12:00'),
        sourceId: 'demo-task-3',
        submitted: true,
      },
      {
        courseId: 'demo-4',
        courseName: 'プロジェクト演習【駅前校】',
        title: '企画書ドラフト提出',
        dueDate: due(1),
        sourceId: 'demo-task-4',
        submitted: false,
      },
      {
        courseId: 'demo-5',
        courseName: 'ネットワーク技術【駅前校】',
        title: 'ネットワーク構成図',
        dueDate: due(2, '17:00'),
        sourceId: 'demo-task-5',
        submitted: false,
      },
      {
        courseId: 'demo-6',
        courseName: 'キャリアデザイン【駅前校】',
        title: '自己分析シート',
        dueDate: due(3, '12:00'),
        sourceId: 'demo-task-6',
        submitted: true,
      },
      {
        courseId: 'demo-7',
        courseName: 'アルゴリズム基礎【駅前校】',
        title: '探索アルゴリズム演習',
        dueDate: pendingToday,
        sourceId: 'demo-task-7',
        submitted: false,
      },
      {
        courseId: 'demo-8',
        courseName: 'システム設計演習【駅前校】',
        title: '画面設計書の提出',
        dueDate: pendingToday,
        sourceId: 'demo-task-8',
        submitted: false,
      },
      {
        courseId: 'demo-1',
        courseName: 'Webプログラミング演習【駅前校】',
        title: 'ポートフォリオサイト制作',
        dueDate: pendingToday,
        sourceId: 'demo-task-9',
        submitted: false,
      },
      {
        courseId: 'demo-2',
        courseName: 'データベース概論【駅前校】',
        title: 'SQL総合演習',
        dueDate: due(6, '17:00'),
        sourceId: 'demo-task-10',
        submitted: false,
      },
      {
        courseId: 'demo-4',
        courseName: 'プロジェクト演習【駅前校】',
        title: '週次進捗レポート',
        dueDate: due(6),
        sourceId: 'demo-task-11',
        submitted: false,
      },
    ],
  };
}

export const PROMOTION_DEMO_NEWS: NewsListItem[] = [
  {
    title: '学内イベント開催のお知らせ',
    newsDate: day(0),
    sender: '学生部',
    category: '学校より',
    readFlg: '0',
    newFlg: '1',
  },
  {
    title: '図書館の開館時間について',
    newsDate: day(-1),
    sender: '図書館',
    category: '施設案内',
    readFlg: '1',
    newFlg: '0',
  },
  {
    title: 'システムメンテナンスのお知らせ',
    newsDate: day(-2),
    sender: '情報システム室',
    category: '重要',
    importanceCd: '02',
    readFlg: '0',
    newFlg: '0',
  },
  {
    title: 'キャリアガイダンス開催のご案内',
    newsDate: day(-2),
    sender: 'キャリアセンター',
    category: '就職支援',
    readFlg: '0',
    newFlg: '1',
  },
  {
    title: '学生作品展示会について',
    newsDate: day(-3),
    sender: '教務部',
    category: 'イベント',
    readFlg: '1',
    newFlg: '0',
  },
  {
    title: '健康診断の日程について',
    newsDate: day(-4),
    sender: '学生部',
    category: '学生生活',
    readFlg: '0',
    newFlg: '0',
  },
  {
    title: '奨学金説明会の開催について',
    newsDate: day(-5),
    sender: '学生課',
    category: '奨学金',
    readFlg: '1',
    newFlg: '0',
  },
  {
    title: '資格試験対策講座の受講者募集',
    newsDate: day(-6),
    sender: '資格支援センター',
    category: '講座',
    readFlg: '0',
    newFlg: '0',
  },
  {
    title: '校内ネットワーク利用時のお願い',
    newsDate: day(-7),
    sender: '情報システム室',
    category: 'お知らせ',
    readFlg: '1',
    newFlg: '0',
  },
  {
    title: '前期行事予定の更新について',
    newsDate: day(-8),
    sender: '教務部',
    category: '学校より',
    readFlg: '1',
    newFlg: '0',
  },
];
