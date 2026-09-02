/**
 * 追加予定のクリックプレビュー（Google カレンダー風）。
 * 詳細表示と、編集／削除への導線だけを持つ。
 */

import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  formatCustomCalEventTimeLabel,
  formatCustomCalEventUrlLabel,
  type CustomCalEvent,
} from '../../../domain/custom-cal-events';
import { PORTAL_DOM } from '../../../shared/constants';
import { type CalendarWeekStart } from '../../../lib/date';
import { useI18n } from '../../../i18n';
import { setRuntimeElementCss } from '../../../lib/runtime-element-style';
import { useAnimatedClose } from '../use-dialog-behavior';

export interface CustomCalEventPreviewAnchor {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

interface CustomCalEventPreviewProps {
  event: CustomCalEvent;
  anchor: CustomCalEventPreviewAnchor;
  weekStart: CalendarWeekStart;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function anchorFromRect(rect: DOMRect): CustomCalEventPreviewAnchor {
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height,
  };
}

export function previewAnchorFromElement(el: Element): CustomCalEventPreviewAnchor {
  return anchorFromRect(el.getBoundingClientRect());
}

export function CustomCalEventPreview({
  event,
  anchor,
  weekStart,
  onEdit,
  onDelete,
  onClose,
}: CustomCalEventPreviewProps) {
  const { t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const { closing, requestClose, finishClose } = useAnimatedClose(onClose, 220);
  const overlayEl =
    typeof document !== 'undefined' ? document.getElementById(PORTAL_DOM.overlayRoot) : null;

  const weekdayLabels =
    weekStart === 'sunday' ? t.calendar.weekdaysSunday : t.calendar.weekdaysMonday;
  const weekdayOrder = weekStart === 'sunday' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];

  const timeLabel = formatCustomCalEventTimeLabel(event, t.calendar.customEventAllDay);
  const kindLabel =
    event.kind === 'recurring'
      ? t.calendar.customEventRecurringMeta
      : t.calendar.customEventOnceMeta;
  const whenLabel =
    event.kind === 'recurring'
      ? (weekdayLabels[weekdayOrder.indexOf(event.weekday)] ?? kindLabel)
      : event.date;

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const pad = 10;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const left = Math.max(
      pad,
      Math.min(anchor.left + anchor.width / 2 - pw / 2, window.innerWidth - pw - pad),
    );
    let top = anchor.bottom + pad;
    if (top + ph > window.innerHeight - pad) {
      top = Math.max(pad, anchor.top - ph - pad);
    }
    setRuntimeElementCss(panel, 'position', `left:${left}px;top:${top}px`);
  }, [anchor]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      }
    }
    function onPointerDown(e: PointerEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      if (e.target instanceof Node && panel.contains(e.target)) return;
      // 同じチップの再クリックは親側で付け替える
      if (
        e.target instanceof Element &&
        e.target.closest('[data-custom-event-id], .p-cal-custom-ev')
      ) {
        return;
      }
      requestClose();
    }
    function onScroll() {
      requestClose();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [requestClose]);

  if (!overlayEl) return null;

  const style = { position: 'fixed' } as CSSProperties;

  return createPortal(
    <div
      ref={panelRef}
      className={`p-cal-custom-preview${closing ? ' is-closing' : ''}`}
      style={style}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onAnimationEnd={(e) => {
        if (!closing) return;
        if (e.target !== e.currentTarget) return;
        finishClose();
      }}
    >
      <div className="p-cal-custom-preview-head">
        <span className="p-cal-custom-ev-badge" aria-hidden>
          {t.calendar.customEventBadge}
        </span>
        <button
          type="button"
          className="p-cal-custom-preview-close"
          aria-label={t.common.close}
          onClick={requestClose}
        >
          ×
        </button>
      </div>
      <h2 id={titleId} className="p-cal-custom-preview-title">
        {event.title}
      </h2>
      <div className="p-cal-pop-rail-wrap">
        <div className="p-cal-pop-rail-body">
          <p className="p-cal-pop-rail-kv">
            <span className="p-cal-pop-rail-k">{t.calendar.customEventDate}</span>
            <span className="p-cal-pop-rail-v">
              {whenLabel}
              {' · '}
              {kindLabel}
            </span>
          </p>
          <p className="p-cal-pop-rail-kv">
            <span className="p-cal-pop-rail-k">{t.calendar.time}</span>
            <span className="p-cal-pop-rail-v">{timeLabel}</span>
          </p>
          {event.note ? (
            <p className="p-cal-pop-rail-kv p-cal-pop-rail-kv--note">
              <span className="p-cal-pop-rail-k">{t.calendar.customEventMemo}</span>
              <span className="p-cal-pop-rail-v p-cal-custom-preview-note">{event.note}</span>
            </p>
          ) : null}
          {event.urls && event.urls.length > 0 ? (
            <div className="p-cal-pop-rail-kv p-cal-custom-preview-links">
              <span className="p-cal-pop-rail-k">{t.calendar.customEventLinks}</span>
              <span className="p-cal-pop-rail-v p-cal-custom-preview-link-list">
                {event.urls.map((url) => (
                  <a
                    key={url}
                    className="p-cal-custom-preview-link"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {formatCustomCalEventUrlLabel(url)}
                  </a>
                ))}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="p-cal-custom-preview-actions">
        <button type="button" className="p-cal-custom-preview-btn is-danger" onClick={onDelete}>
          {t.calendar.customEventDelete}
        </button>
        <button type="button" className="p-cal-custom-preview-btn is-primary" onClick={onEdit}>
          {t.common.edit}
        </button>
      </div>
    </div>,
    overlayEl,
  );
}
