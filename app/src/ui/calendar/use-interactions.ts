/**
 * カレンダーイベントのツールチップとコンテキストメニューを担うフックです。
 * `#portal-overlay` 上のキャプチャ段階のポインタ／コンテキストメニューイベントを処理し、表示 DOM は `CalendarOverlayUiProvider` の ref 経由で更新します。
 */

import { useEffect, useRef, type RefObject } from 'react';
import { afterLayout } from './anim';
import { esc, setHtml } from '../../lib/dom';
import { beginKingLmsCourseListSync } from '../../lib/king-lms-course-sync';
import { KING_LMS_COURSE_SYNC_URL } from '../../shared/constants';
import { formatRemainingUntilDue } from './assignment';
import { syllabusUrl, findKingLmsUrl } from './kogi';
import { readStoredCourses, useCourses, type CourseRow } from '../../context/courses';
import { useCalendarOverlayUiRefs } from '../../context/calendarOverlayUi';
import { usePortalDom } from '../../context/portalDom';
import { useI18n, type AppLanguage, type I18nMessages } from '../../i18n';
import { buildKingLmsSamlLoginUrl } from '../../shared/king-lms-url';
import { setRuntimeElementCss } from '../../lib/runtime-element-style';

/** tooltip 先頭の「コード：」は左ラベルに寄せるため、値から除く */
function stripLeadingCodeJaPrefix(raw: string): string {
  return raw.replace(/^\s*コード\s*[：:]\s*/i, '').trim();
}

function openKingLmsUrl(url: string): void {
  const loginUrl = buildKingLmsSamlLoginUrl(url);
  const opened = window.open(loginUrl, '_blank');
  if (opened) {
    try {
      opened.opener = null;
    } catch {
      /* ignore */
    }
    return;
  }
  window.location.href = loginUrl;
}

function kingLmsUrlForEvent(ev: Element, courses: CourseRow[]): string {
  const title = ev instanceof HTMLElement ? ev.dataset.calTitle || '' : '';
  return findKingLmsUrl(courses, title);
}

function attachCalendarTooltipAndContextMenu(
  overlayRoot: HTMLElement,
  hoverPopEl: HTMLElement,
  menuEl: HTMLDivElement,
  btnSyl: HTMLButtonElement,
  btnKing: HTMLButtonElement,
  coursesRef: RefObject<CourseRow[]>,
  setCourses: (rows: CourseRow[]) => void,
  settingsPopRef: RefObject<HTMLDivElement | null>,
  language: AppLanguage,
  t: I18nMessages,
): () => void {
  let hideTimer = 0;
  let hoverRevision = 0;
  let activeHoverAnchor: Element | null = null;
  let resolvingPrimaryCourseClick = false;

  function hide() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = 0;
    }
    hoverRevision++;
    activeHoverAnchor = null;
    hoverPopEl.hidden = true;
    hoverPopEl.classList.remove('is-entering');
    hoverPopEl.replaceChildren();
  }

  function positionHover(anchor: Element) {
    const r = anchor.getBoundingClientRect();
    const pad = 10;
    const pw = hoverPopEl.offsetWidth;
    const ph = hoverPopEl.offsetHeight;
    // アンカー中央の真下に配置し、画面端からはみ出ないよう左右をクランプ
    const left = Math.max(
      pad,
      Math.min(r.left + r.width / 2 - pw / 2, window.innerWidth - pw - pad),
    );
    let top = r.bottom + pad;
    // 下端を超える場合はアンカー上側に反転（フリップ）
    if (top + ph > window.innerHeight - pad) top = r.top - ph - pad;
    setRuntimeElementCss(hoverPopEl, 'position', `left:${left}px;top:${Math.max(pad, top)}px`);
  }

  function revealTooltip(anchor: Element, revision: number) {
    hoverPopEl.hidden = false;
    positionHover(anchor);
    hoverPopEl.classList.remove('is-entering');
    void hoverPopEl.offsetWidth;
    hoverPopEl.classList.add('is-entering');
    afterLayout(() => {
      if (revision === hoverRevision && activeHoverAnchor === anchor) positionHover(anchor);
    });
  }

  function showTooltip(anchor: Element) {
    if (!(anchor instanceof HTMLElement)) return;
    const revision = ++hoverRevision;
    activeHoverAnchor = anchor;
    const title = anchor.dataset.calTitle || '';
    const meta = anchor.dataset.calMeta || '';
    const tip = (anchor.dataset.calTip || '').trim();
    const time = (anchor.dataset.calTime || '').trim();
    const kind = anchor.dataset.calKind || '';
    const status = anchor.dataset.calAssignmentStatus || '';

    if (!title && !meta && !tip && !time) return;

    // 追加予定: クリックでプレビューを開くため、ホバーチップは出さない
    if (kind === 'custom' || anchor.classList.contains('p-cal-custom-ev')) return;

    // 課題: 左レール＋1行1項目
    if (kind === 'assignment') {
      const statusLabel =
        status === 'submitted'
          ? t.calendar.submitted
          : status === 'overdue'
            ? t.calendar.overdue
            : status === 'pending'
              ? t.calendar.pending
              : '';
      const blocks: string[] = [];
      blocks.push(`<div class="p-cal-pop-title">${esc(title || t.common.untitled)}</div>`);
      blocks.push(
        `<div class="p-cal-pop-rail-wrap"><div class="p-cal-pop-rail-body${status ? ` p-cal-pop-rail-body--${status}` : ''}">`,
      );
      if (statusLabel) {
        blocks.push(
          `<p class="p-cal-pop-rail-status is-${esc(status)}" role="status">${esc(statusLabel)}</p>`,
        );
      }
      if (meta) {
        blocks.push(
          '<p class="p-cal-pop-rail-kv">' +
            `<span class="p-cal-pop-rail-k">${esc(t.calendar.course)}</span>` +
            `<span class="p-cal-pop-rail-v">${esc(meta)}</span>` +
            '</p>',
        );
      }
      if (time) {
        const dueIso = (anchor.dataset.calDueIso || '').trim();
        const remain = dueIso ? formatRemainingUntilDue(dueIso, language) : null;
        const remainHtml = remain ? `<span class="p-cal-pop-remain">${esc(remain)}</span>` : '';
        blocks.push(
          '<div class="p-cal-pop-rail-due">' +
            '<p class="p-cal-pop-rail-kv p-cal-pop-rail-kv--due">' +
            `<span class="p-cal-pop-rail-k">${esc(t.calendar.due)}</span>` +
            `<span class="p-cal-pop-rail-v p-cal-pop-rail-v--due">` +
            `<span class="p-cal-pop-due-primary">${esc(time)}</span>${remainHtml}` +
            '</span></p></div>',
        );
      }
      blocks.push('</div></div>');
      setHtml(hoverPopEl, blocks.join(''));
      revealTooltip(anchor, revision);
      return;
    }

    const blocks: string[] = [];
    blocks.push(`<div class="p-cal-pop-title">${esc(title || t.common.untitled)}</div>`);

    let thirdLine = '';
    if (tip && tip !== title.trim()) {
      const lines = tip
        .split('\n')
        .map((l) => l.trimEnd())
        .filter(Boolean);
      thirdLine = stripLeadingCodeJaPrefix(lines[2] || '');
    }

    const kogiPeriod = (anchor.dataset.calKogiPeriod || '').trim();
    const kogiRoom = (anchor.dataset.calKogiRoom || '').trim();
    const useKogiSplit = kind === 'kogi' && (kogiPeriod !== '' || kogiRoom !== '');

    const hasRailBody = Boolean(time || thirdLine || meta || useKogiSplit);

    blocks.push('<div class="p-cal-pop-rail-wrap"><div class="p-cal-pop-rail-body">');

    if (hasRailBody) {
      if (time) {
        const dueIso = (anchor.dataset.calDueIso || '').trim();
        const remain = dueIso ? formatRemainingUntilDue(dueIso, language) : null;
        const remainHtml = remain ? `<span class="p-cal-pop-remain">${esc(remain)}</span>` : '';
        if (remainHtml) {
          blocks.push(
            '<div class="p-cal-pop-rail-due">' +
              '<p class="p-cal-pop-rail-kv p-cal-pop-rail-kv--due">' +
              `<span class="p-cal-pop-rail-k">${esc(t.calendar.time)}</span>` +
              '<span class="p-cal-pop-rail-v p-cal-pop-rail-v--due">' +
              `<span class="p-cal-pop-due-primary">${esc(time)}</span>${remainHtml}` +
              '</span></p></div>',
          );
        } else {
          blocks.push(
            '<p class="p-cal-pop-rail-kv">' +
              `<span class="p-cal-pop-rail-k">${esc(t.calendar.time)}</span>` +
              `<span class="p-cal-pop-rail-v">${esc(time)}</span>` +
              '</p>',
          );
        }
      }
      if (useKogiSplit) {
        if (kogiPeriod !== '') {
          blocks.push(
            '<p class="p-cal-pop-rail-kv">' +
              `<span class="p-cal-pop-rail-k">${esc(t.calendar.period)}</span>` +
              `<span class="p-cal-pop-rail-v">${esc(kogiPeriod)}</span>` +
              '</p>',
          );
        }
        if (kogiRoom !== '') {
          blocks.push(
            '<p class="p-cal-pop-rail-kv">' +
              `<span class="p-cal-pop-rail-k">${esc(t.calendar.room)}</span>` +
              `<span class="p-cal-pop-rail-v">${esc(kogiRoom)}</span>` +
              '</p>',
          );
        }
      } else if (meta) {
        blocks.push(
          '<p class="p-cal-pop-rail-kv">' +
            `<span class="p-cal-pop-rail-k">${esc(t.calendar.info)}</span>` +
            `<span class="p-cal-pop-rail-v">${esc(meta)}</span>` +
            '</p>',
        );
      }
      if (thirdLine) {
        blocks.push(
          '<p class="p-cal-pop-rail-kv p-cal-pop-rail-kv--note">' +
            `<span class="p-cal-pop-rail-k">${esc(t.calendar.code)}</span>` +
            `<span class="p-cal-pop-rail-v">${esc(thirdLine)}</span>` +
            '</p>',
        );
      }
    }

    blocks.push('</div></div>');

    setHtml(hoverPopEl, blocks.join(''));
    revealTooltip(anchor, revision);
  }

  function onMouseOver(e: MouseEvent) {
    const hit = e.target instanceof Element ? e.target.closest('.p-cal-ev') : null;
    if (!hit || !overlayRoot.contains(hit)) return;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = 0;
    }
    if (hit !== activeHoverAnchor || hoverPopEl.hidden) showTooltip(hit);
  }

  function onMouseOut(e: MouseEvent) {
    const rel = e.relatedTarget;
    if (rel instanceof Node && overlayRoot.contains(rel)) {
      const next = rel instanceof Element ? rel.closest('.p-cal-ev') : null;
      if (next) {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = 0;
        }
        if (next !== activeHoverAnchor || hoverPopEl.hidden) showTooltip(next);
        return;
      }
    }
    const revision = hoverRevision;
    hideTimer = window.setTimeout(() => {
      hideTimer = 0;
      if (revision === hoverRevision) hide();
    }, 60);
  }

  function onPointerMove(e: PointerEvent) {
    const hit = e.target instanceof Element ? e.target.closest('.p-cal-ev') : null;
    if (!hit || !overlayRoot.contains(hit)) return;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = 0;
    }
    if (hit !== activeHoverAnchor || hoverPopEl.hidden) showTooltip(hit);
  }

  function onKogiPrimaryClick(e: MouseEvent) {
    if (e.button !== 0) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    const ev = t.closest('.p-cal-ev[data-cal-kind="kogi"]');
    if (!ev || !overlayRoot.contains(ev)) return;
    if (ev instanceof HTMLAnchorElement) return;
    e.preventDefault();
    e.stopPropagation();

    if (resolvingPrimaryCourseClick) return;

    const immediateUrl = kingLmsUrlForEvent(ev, coursesRef.current);
    if (immediateUrl) {
      openKingLmsUrl(immediateUrl);
      return;
    }

    resolvingPrimaryCourseClick = true;
    void (async () => {
      try {
        const storedCourses = await readStoredCourses();
        if (storedCourses.length > 0) {
          coursesRef.current = storedCourses;
          setCourses(storedCourses);
          const storedUrl = kingLmsUrlForEvent(ev, storedCourses);
          openKingLmsUrl(storedUrl || KING_LMS_COURSE_SYNC_URL);
          return;
        }
        await beginKingLmsCourseListSync();
      } finally {
        resolvingPrimaryCourseClick = false;
      }
    })();
  }

  overlayRoot.addEventListener('click', onKogiPrimaryClick);
  overlayRoot.addEventListener('mouseover', onMouseOver);
  overlayRoot.addEventListener('mouseout', onMouseOut);
  overlayRoot.addEventListener('pointermove', onPointerMove, { passive: true });
  overlayRoot.addEventListener('scroll', hide, { passive: true, capture: true });
  window.addEventListener('scroll', hide, { passive: true, capture: true });

  let urlSyllabus = '';
  let urlKingLms = '';

  function closeCtx() {
    menuEl.hidden = true;
  }

  function positionMenu(clientX: number, clientY: number) {
    const pad = 8;
    // カーソル位置を起点に、画面四辺からはみ出ないようにクランプ
    const left = Math.max(pad, Math.min(clientX, window.innerWidth - menuEl.offsetWidth - pad));
    const top = Math.max(pad, Math.min(clientY, window.innerHeight - menuEl.offsetHeight - pad));
    setRuntimeElementCss(menuEl, 'position', `left:${left}px;top:${top}px`);
  }

  function onContextMenu(e: MouseEvent) {
    const ev =
      e.target instanceof Element ? e.target.closest('.p-cal-ev[data-cal-kind="kogi"]') : null;
    if (!ev || !overlayRoot.contains(ev)) return;
    e.preventDefault();
    e.stopPropagation();
    hide();

    const title = (ev as HTMLElement).dataset.calTitle || '';
    const tipPlain = (ev as HTMLElement).dataset.calTip || '';
    urlSyllabus = syllabusUrl('', tipPlain);
    urlKingLms = findKingLmsUrl(coursesRef.current, title);

    btnSyl.disabled = !urlSyllabus;
    btnKing.hidden = !urlKingLms;
    btnKing.disabled = false;

    menuEl.hidden = false;
    positionMenu(e.clientX, e.clientY);
    afterLayout(() => positionMenu(e.clientX, e.clientY));
  }

  function onMenuClick(e: MouseEvent) {
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (!btn || !menuEl.contains(btn)) return;
    if (btn === btnSyl && urlSyllabus) window.open(urlSyllabus, '_blank', 'noopener,noreferrer');
    if (btn === btnKing && urlKingLms)
      window.open(buildKingLmsSamlLoginUrl(urlKingLms), '_blank', 'noopener,noreferrer');
    closeCtx();
  }

  function onDocPointerDown(e: PointerEvent) {
    if (menuEl.hidden) return;
    if (menuEl.contains(e.target as Node)) return;
    closeCtx();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    const sp = settingsPopRef.current;
    if (sp && !sp.hidden) return;
    if (!menuEl.hidden) {
      closeCtx();
      return;
    }
    hide();
  }

  overlayRoot.addEventListener('contextmenu', onContextMenu);
  menuEl.addEventListener('click', onMenuClick);
  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('keydown', onKeyDown);

  return () => {
    overlayRoot.removeEventListener('click', onKogiPrimaryClick);
    overlayRoot.removeEventListener('mouseover', onMouseOver);
    overlayRoot.removeEventListener('mouseout', onMouseOut);
    overlayRoot.removeEventListener('pointermove', onPointerMove);
    overlayRoot.removeEventListener('scroll', hide, { capture: true } as AddEventListenerOptions);
    window.removeEventListener('scroll', hide, { capture: true } as AddEventListenerOptions);
    overlayRoot.removeEventListener('contextmenu', onContextMenu);
    menuEl.removeEventListener('click', onMenuClick);
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onKeyDown);
    hide();
    closeCtx();
  };
}

/**
 * @param calendarInteractionEpoch ルートやレイアウトが変わったときに変えると、DOM アンカー再マウント後にリスナーを張り直す
 */
export function useCalendarInteractions(calendarInteractionEpoch: string | number): void {
  const { language, t } = useI18n();
  const { courses, setCourses } = useCourses();
  const coursesRef = useRef(courses);
  coursesRef.current = courses;
  const { hoverPopRef, ctxMenuRef, btnSylRef, btnKingRef } = useCalendarOverlayUiRefs();
  const { overlayRoot, settingsPopRef } = usePortalDom();

  useEffect(() => {
    const hoverPopEl = hoverPopRef.current;
    const menuEl = ctxMenuRef.current;
    const btnSyl = btnSylRef.current;
    const btnKing = btnKingRef.current;
    if (hoverPopEl === null || menuEl === null || btnSyl === null || btnKing === null) {
      return;
    }
    return attachCalendarTooltipAndContextMenu(
      overlayRoot,
      hoverPopEl,
      menuEl,
      btnSyl,
      btnKing,
      coursesRef,
      setCourses,
      settingsPopRef,
      language,
      t,
    );
  }, [
    hoverPopRef,
    ctxMenuRef,
    btnSylRef,
    btnKingRef,
    overlayRoot,
    setCourses,
    settingsPopRef,
    calendarInteractionEpoch,
    language,
    t,
  ]);
}
