/**
 * 追加予定の登録・編集モーダル。
 */

import { useEffect, useId, useRef, useState, type AnimationEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { CustomCalEvent, CustomCalWeekday } from '../../../domain/custom-cal-events';
import type { CustomCalEventInput } from '../../../context/custom-cal-events';
import { PORTAL_DOM } from '../../../shared/constants';
import { parseIsoLocal, toIsoLocal, type CalendarWeekStart } from '../../../lib/date';
import { useI18n } from '../../../i18n';
import { useAnimatedClose, useDialogFocusTrap } from '../use-dialog-behavior';
import { CustomCalEventUrlFields, useCustomCalEventUrls } from './CustomCalEventUrlFields';

export type CustomCalEditorTarget =
  | { mode: 'new'; presetIso?: string; presetWeekday?: CustomCalWeekday }
  | { mode: 'edit'; event: CustomCalEvent };

interface CustomCalEventModalProps {
  target: CustomCalEditorTarget;
  weekStart: CalendarWeekStart;
  onSave: (input: CustomCalEventInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const WEEKDAY_ORDER_MON: CustomCalWeekday[] = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_ORDER_SUN: CustomCalWeekday[] = [0, 1, 2, 3, 4, 5, 6];

/** 基準日以降で、指定曜日に当たる最初の日（当日含む） */
function isoOnOrAfterWeekday(weekday: CustomCalWeekday, fromIso?: string): string {
  const from = fromIso ? parseIsoLocal(fromIso) : new Date();
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const delta = (weekday - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + delta);
  return toIsoLocal(base);
}

function weekdayFromIso(iso: string): CustomCalWeekday {
  return parseIsoLocal(iso).getDay() as CustomCalWeekday;
}

function initialKind(target: CustomCalEditorTarget): 'recurring' | 'once' {
  if (target.mode === 'edit') return target.event.kind;
  // 日付セル／帯からの新規は、まずその日の単発として開く
  return target.presetIso ? 'once' : 'recurring';
}

function initialWeekday(target: CustomCalEditorTarget): CustomCalWeekday {
  if (target.mode === 'edit') {
    if (target.event.kind === 'recurring') return target.event.weekday;
    return weekdayFromIso(target.event.date);
  }
  if (target.presetWeekday !== undefined) return target.presetWeekday;
  if (target.presetIso) return weekdayFromIso(target.presetIso);
  return 1;
}

function initialDate(target: CustomCalEditorTarget): string {
  if (target.mode === 'edit') {
    if (target.event.kind === 'once') return target.event.date;
    return isoOnOrAfterWeekday(target.event.weekday);
  }
  return target.presetIso ?? '';
}

function initialFormValues(target: CustomCalEditorTarget) {
  const editing = target.mode === 'edit' ? target.event : null;
  return {
    editing,
    title: editing ? editing.title : '',
    note: editing?.note ?? '',
    urls: editing?.urls,
    timeStart: editing?.timeStart ?? '',
    timeEnd: editing?.timeEnd ?? '',
    kind: initialKind(target),
    weekday: initialWeekday(target),
    date: initialDate(target),
  };
}

export function CustomCalEventModal({
  target,
  weekStart,
  onSave,
  onDelete,
  onClose,
}: CustomCalEventModalProps) {
  const { t } = useI18n();
  const titleId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const overlayEl =
    typeof document !== 'undefined' ? document.getElementById(PORTAL_DOM.overlayRoot) : null;

  const initial = useRef(initialFormValues(target)).current;
  const { editing } = initial;
  const [title, setTitle] = useState(initial.title);
  const [note, setNote] = useState(initial.note);
  const urlController = useCustomCalEventUrls(initial.urls);
  const [timeStart, setTimeStart] = useState(initial.timeStart);
  const [timeEnd, setTimeEnd] = useState(initial.timeEnd);
  const [kind, setKind] = useState<'recurring' | 'once'>(initial.kind);
  const [weekday, setWeekday] = useState<CustomCalWeekday>(initial.weekday);
  const [date, setDate] = useState(initial.date);
  const [error, setError] = useState(false);
  const { closing, requestClose, finishClose } = useAnimatedClose(onClose, 320);

  const weekdayLabels =
    weekStart === 'sunday' ? t.calendar.weekdaysSunday : t.calendar.weekdaysMonday;
  const weekdayValues = weekStart === 'sunday' ? WEEKDAY_ORDER_SUN : WEEKDAY_ORDER_MON;

  const onRootAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (!closing) return;
    if (e.target !== e.currentTarget) return;
    finishClose();
  };

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useDialogFocusTrap(dialogRef, requestClose);

  const changeKind = (next: 'recurring' | 'once') => {
    if (next === kind) return;
    if (next === 'recurring') {
      // 日付があればその曜日を引き継ぐ
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        setWeekday(weekdayFromIso(date));
      }
      setKind('recurring');
      return;
    }
    // 毎週 → 日付: 空なら選択中の曜日の直近の日を入れる
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setDate(isoOnOrAfterWeekday(weekday));
    }
    setKind('once');
  };

  if (!overlayEl) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = title.trim();
    if (!trimmed) {
      setError(true);
      titleRef.current?.focus();
      return;
    }
    const times = {
      timeStart: timeStart || undefined,
      timeEnd: timeStart ? timeEnd || undefined : undefined,
    };
    const linkUrls = urlController.validate({
      invalid: t.calendar.customEventUrlInvalid,
      duplicate: t.calendar.customEventUrlDedupe,
    });
    if (!linkUrls) return;
    if (kind === 'recurring') {
      onSave({
        title: trimmed,
        note: note.trim() || undefined,
        urls: linkUrls,
        ...times,
        kind: 'recurring',
        weekday,
      });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError(true);
      return;
    }
    onSave({
      title: trimmed,
      note: note.trim() || undefined,
      urls: linkUrls,
      ...times,
      kind: 'once',
      date,
    });
  };

  return createPortal(
    <div
      className={`p-custom-cal-modal-root${closing ? ' is-closing' : ''}`}
      role="presentation"
      onAnimationEnd={onRootAnimationEnd}
      onMouseDown={(e) => {
        // mousedown で閉じると mouseup/click が下のポータルリンクへ貫通して URL が変わる
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <form
        ref={dialogRef}
        className="p-custom-cal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        action="#"
        noValidate
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id={titleId} className="p-custom-cal-modal-title">
          {editing ? t.calendar.customEventModalTitleEdit : t.calendar.customEventModalTitleNew}
        </h2>

        <label className="p-custom-cal-field">
          <span>{t.calendar.customEventTitle}</span>
          <input
            ref={titleRef}
            type="text"
            value={title}
            maxLength={80}
            placeholder={t.calendar.customEventTitlePlaceholder}
            aria-invalid={error && !title.trim()}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(false);
            }}
          />
        </label>

        <fieldset className="p-custom-cal-field p-custom-cal-kind">
          <legend>{t.calendar.customEventKind}</legend>
          <label>
            <input
              type="radio"
              name="custom-cal-kind"
              checked={kind === 'recurring'}
              onChange={() => changeKind('recurring')}
            />
            <span>{t.calendar.customEventKindRecurring}</span>
          </label>
          <label>
            <input
              type="radio"
              name="custom-cal-kind"
              checked={kind === 'once'}
              onChange={() => changeKind('once')}
            />
            <span>{t.calendar.customEventKindOnce}</span>
          </label>
        </fieldset>

        {kind === 'recurring' ? (
          <label className="p-custom-cal-field">
            <span>{t.calendar.customEventWeekday}</span>
            <select
              value={String(weekday)}
              onChange={(e) => setWeekday(Number(e.target.value) as CustomCalWeekday)}
            >
              {weekdayValues.map((wd, i) => (
                <option key={wd} value={String(wd)}>
                  {weekdayLabels[i]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="p-custom-cal-field">
            <span>{t.calendar.customEventDate}</span>
            <input
              type="date"
              value={date}
              required
              onChange={(e) => {
                const next = e.target.value;
                setDate(next);
                if (/^\d{4}-\d{2}-\d{2}$/.test(next)) {
                  setWeekday(weekdayFromIso(next));
                }
                setError(false);
              }}
            />
          </label>
        )}

        {editing && kind === 'recurring' ? (
          <p className="p-custom-cal-hint">{t.calendar.customEventRecurringEditHint}</p>
        ) : null}

        <div className="p-custom-cal-time-row">
          <label className="p-custom-cal-field">
            <span>{t.calendar.customEventTimeStart}</span>
            <input
              type="time"
              value={timeStart}
              onChange={(e) => {
                const next = e.target.value;
                setTimeStart(next);
                if (!next) {
                  setTimeEnd('');
                  return;
                }
                setTimeEnd((prev) => (prev && prev < next ? '' : prev));
              }}
            />
          </label>
          <label className="p-custom-cal-field">
            <span>{t.calendar.customEventTimeEnd}</span>
            <input
              type="time"
              value={timeEnd}
              disabled={!timeStart}
              min={timeStart || undefined}
              onChange={(e) => setTimeEnd(e.target.value)}
            />
          </label>
        </div>
        <p className="p-custom-cal-hint">{t.calendar.customEventTimeHint}</p>

        <CustomCalEventUrlFields controller={urlController} />

        <label className="p-custom-cal-field">
          <span>{t.calendar.customEventNote}</span>
          <textarea
            value={note}
            maxLength={200}
            rows={2}
            placeholder={t.calendar.customEventNotePlaceholder}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <div className="p-custom-cal-modal-actions">
          {editing && onDelete ? (
            <button type="button" className="p-custom-cal-btn is-danger" onClick={onDelete}>
              {t.calendar.customEventDelete}
            </button>
          ) : (
            <span />
          )}
          <div className="p-custom-cal-modal-actions-end">
            <button type="button" className="p-custom-cal-btn" onClick={requestClose}>
              {t.calendar.customEventCancel}
            </button>
            <button type="submit" className="p-custom-cal-btn is-primary">
              {t.calendar.customEventSave}
            </button>
          </div>
        </div>
      </form>
    </div>,
    overlayEl,
  );
}
