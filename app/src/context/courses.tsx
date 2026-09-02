/**
 * King LMS コース一覧の React コンテキスト。
 * ホームページでストレージから読み込み、カレンダーパネルで参照する。
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SK } from '../shared/constants';
import { useSettings } from './settings';
import storage from '../lib/storage';

export type CourseRow = { displayName?: string; externalAccessUrl?: string };

export function isCourseRow(x: unknown): x is CourseRow {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.displayName != null && typeof o.displayName !== 'string') return false;
  if (o.externalAccessUrl != null && typeof o.externalAccessUrl !== 'string') return false;
  return true;
}

export function isCourseRowArray(x: unknown): x is CourseRow[] {
  return Array.isArray(x) && x.every(isCourseRow);
}

export async function readStoredCourses(): Promise<CourseRow[]> {
  const data = await storage.get(SK.kingLmsCourses);
  const rows = data[SK.kingLmsCourses];
  return isCourseRowArray(rows) ? rows : [];
}

interface CoursesContextValue {
  courses: CourseRow[];
  setCourses: (rows: CourseRow[]) => void;
}

const CoursesContext = createContext<CoursesContextValue | null>(null);

export function CoursesProvider({ children }: { children: ReactNode }) {
  const { settingsReady } = useSettings();
  const [courses, setCourses] = useState<CourseRow[]>([]);

  useEffect(() => {
    if (!settingsReady) return;
    let cancelled = false;
    void readStoredCourses().then((rows) => {
      if (!cancelled && rows.length > 0) setCourses(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [settingsReady]);

  const value = useMemo(() => ({ courses, setCourses }), [courses]);
  return <CoursesContext.Provider value={value}>{children}</CoursesContext.Provider>;
}

export function useCourses(): CoursesContextValue {
  const ctx = useContext(CoursesContext);
  if (!ctx) throw new Error('useCourses は CoursesProvider の中で使ってください');
  return ctx;
}
