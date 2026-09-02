/**
 * 授業カレンダー「追加予定」の React コンテキスト。
 * `chrome.storage.local` に永続化し、マイリンク同期・他タブ変更も反映する。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  EMPTY_CUSTOM_CAL_EVENTS,
  CUSTOM_CAL_EVENTS_MAX,
  createCustomCalEvent,
  parseCustomCalEventCollection,
  updateCustomCalEvent,
  type CustomCalEvent,
  type CustomCalEventDraft,
  type StoredCustomCalEventCollection,
} from '../domain/custom-cal-events';
import { SK } from '../shared/constants';
import storage from '../lib/storage';
import { useSettings } from './settings';

export type CustomCalEventInput = CustomCalEventDraft;

interface CustomCalEventsContextValue {
  events: CustomCalEvent[];
  /** 未使用時は折りたたみ。予定があるときは開く（ユーザー明示操作を優先） */
  bandCollapsed: boolean;
  setBandCollapsed: (collapsed: boolean) => void;
  addEvent: (input: CustomCalEventInput) => CustomCalEvent | null;
  updateEvent: (id: string, input: CustomCalEventInput) => CustomCalEvent | null;
  deleteEvent: (id: string) => void;
  /** インポート等でコレクションを丸ごと差し替える */
  replaceEvents: (collection: StoredCustomCalEventCollection) => void;
}

const CustomCalEventsContext = createContext<CustomCalEventsContextValue | null>(null);

function parseCollapsed(raw: unknown, eventCount: number): boolean {
  if (raw === true) return true;
  if (raw === false) return false;
  // 未設定: 予定がなければ閉じ、あれば開く（発見性）
  return eventCount === 0;
}

export function CustomCalEventsProvider({ children }: { children: ReactNode }) {
  const { settingsReady } = useSettings();
  const [ready, setReady] = useState(false);
  const [collection, setCollection] =
    useState<StoredCustomCalEventCollection>(EMPTY_CUSTOM_CAL_EVENTS);
  const [bandCollapsed, setBandCollapsedState] = useState(true);
  const collectionRef = useRef(collection);
  const bandCollapsedRef = useRef(bandCollapsed);
  const collapsedExplicitRef = useRef(false);

  const applyCollection = useCallback((next: StoredCustomCalEventCollection) => {
    collectionRef.current = next;
    setCollection(next);
  }, []);

  const applyCollapsed = useCallback((collapsed: boolean, explicit: boolean) => {
    bandCollapsedRef.current = collapsed;
    collapsedExplicitRef.current = explicit;
    setBandCollapsedState(collapsed);
  }, []);

  const persistCollection = useCallback(
    (next: StoredCustomCalEventCollection) => {
      applyCollection(next);
      void storage.set({ [SK.customCalEvents]: next });
    },
    [applyCollection],
  );

  useEffect(() => {
    if (!settingsReady) return;
    let cancelled = false;
    let eventsChangedDuringLoad = false;
    let collapsedChangedDuringLoad = false;

    const unsubscribe = storage.onChanged((changes, area) => {
      if (area !== 'local') return;
      if (changes[SK.customCalEvents]) {
        eventsChangedDuringLoad = true;
        const next = parseCustomCalEventCollection(changes[SK.customCalEvents].newValue);
        applyCollection(next);
        if (!collapsedExplicitRef.current) {
          applyCollapsed(parseCollapsed(undefined, next.events.length), false);
        }
      }
      if (changes[SK.customCalBandCollapsed]) {
        collapsedChangedDuringLoad = true;
        const raw = changes[SK.customCalBandCollapsed].newValue;
        const explicit = raw === true || raw === false;
        applyCollapsed(explicit ? raw === true : bandCollapsedRef.current, explicit);
      }
    });

    void storage.get([SK.customCalEvents, SK.customCalBandCollapsed]).then((data) => {
      if (cancelled) return;
      const next = parseCustomCalEventCollection(data[SK.customCalEvents]);
      if (!eventsChangedDuringLoad) applyCollection(next);
      if (!collapsedChangedDuringLoad) {
        const raw = data[SK.customCalBandCollapsed];
        const explicit = raw === true || raw === false;
        const eventCount = eventsChangedDuringLoad
          ? collectionRef.current.events.length
          : next.events.length;
        applyCollapsed(parseCollapsed(raw, eventCount), explicit);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [settingsReady, applyCollapsed, applyCollection]);

  const setBandCollapsed = useCallback(
    (collapsed: boolean) => {
      applyCollapsed(collapsed, true);
      void storage.set({ [SK.customCalBandCollapsed]: collapsed });
    },
    [applyCollapsed],
  );

  const addEvent = useCallback(
    (input: CustomCalEventInput) => {
      const previous = collectionRef.current;
      if (previous.events.length >= CUSTOM_CAL_EVENTS_MAX) return null;
      const created = createCustomCalEvent(input);
      if (!created) return null;
      persistCollection({
        schemaVersion: 1,
        events: [...previous.events, created],
      });
      if (previous.events.length === 0) {
        applyCollapsed(false, true);
        void storage.set({ [SK.customCalBandCollapsed]: false });
      }
      return created;
    },
    [applyCollapsed, persistCollection],
  );

  const updateEvent = useCallback(
    (id: string, input: CustomCalEventInput) => {
      const previous = collectionRef.current;
      const target = previous.events.find((event) => event.id === id);
      if (!target) return null;
      const updated = updateCustomCalEvent(target, input);
      if (!updated) return null;
      persistCollection({
        schemaVersion: 1,
        events: previous.events.map((event) => (event.id === id ? updated : event)),
      });
      return updated;
    },
    [persistCollection],
  );

  const deleteEvent = useCallback(
    (id: string) => {
      const previous = collectionRef.current;
      if (!previous.events.some((event) => event.id === id)) return;
      persistCollection({
        schemaVersion: 1,
        events: previous.events.filter((event) => event.id !== id),
      });
    },
    [persistCollection],
  );

  const replaceEvents = useCallback(
    (nextRaw: StoredCustomCalEventCollection) => {
      const next = parseCustomCalEventCollection(nextRaw);
      persistCollection(next);
      if (next.events.length > 0) {
        applyCollapsed(false, true);
        void storage.set({ [SK.customCalBandCollapsed]: false });
      }
    },
    [applyCollapsed, persistCollection],
  );

  const value = useMemo(
    () => ({
      events: collection.events,
      bandCollapsed,
      setBandCollapsed,
      addEvent,
      updateEvent,
      deleteEvent,
      replaceEvents,
    }),
    [
      collection.events,
      bandCollapsed,
      setBandCollapsed,
      addEvent,
      updateEvent,
      deleteEvent,
      replaceEvents,
    ],
  );

  return (
    <CustomCalEventsContext.Provider value={value}>
      {ready ? children : null}
    </CustomCalEventsContext.Provider>
  );
}

export function useCustomCalEvents(): CustomCalEventsContextValue {
  const ctx = useContext(CustomCalEventsContext);
  if (!ctx) throw new Error('useCustomCalEvents は CustomCalEventsProvider の中で使ってください');
  return ctx;
}
