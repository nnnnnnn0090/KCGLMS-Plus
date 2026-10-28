/**
 * 初回チュートリアルの最初の画面（ようこそ）。
 * 何ができるようになるかを4つで伝え、このあとの流れを見せてから始めてもらう。
 */

import type { ReactNode, RefObject } from 'react';
import type { I18nMessages } from '../../../../i18n/messages';

const BRAND_ICON_PATH = '/community/activity-icon.png';

function brandIconUrl(): string | null {
  try {
    return typeof browser !== 'undefined' ? browser.runtime.getURL(BRAND_ICON_PATH) : null;
  } catch {
    return null;
  }
}

/** 線だけの小さなアイコン（テーマの色に合わせて描く） */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const HIGHLIGHT_ICONS: ReactNode[] = [
  // 授業と課題（カレンダー）
  <Icon key="calendar">
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4M8 14h2.5M13.5 14H16M8 17.2h2.5" />
  </Icon>,
  // 自分の予定（追加）
  <Icon key="plus">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </Icon>,
  // 見た目（パレット）
  <Icon key="palette">
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.9-.8 1.9-1.7 0-1.2-1-1.6-1-2.7 0-1 .8-1.6 1.8-1.6h2.1a3.7 3.7 0 0 0 3.7-3.7C20.5 7 16.7 3.5 12 3.5Z" />
    <circle cx="7.8" cy="11" r="1" />
    <circle cx="10.5" cy="7.5" r="1" />
    <circle cx="15" cy="7.8" r="1" />
  </Icon>,
  // どの端末でも（同期）
  <Icon key="sync">
    <path d="M19.5 9A7.5 7.5 0 0 0 6 6.5L4.5 8M4.5 15A7.5 7.5 0 0 0 18 17.5l1.5-1.5" />
    <path d="M4.5 4v4h4M19.5 20v-4h-4" />
  </Icon>,
];

interface TourWelcomeProps {
  t: I18nMessages;
  cardRef: RefObject<HTMLDivElement | null>;
  onStart: () => void;
  onLater: () => void;
}

export function TourWelcome({ t, cardRef, onStart, onLater }: TourWelcomeProps) {
  const copy = t.guidedTour.welcome;
  const title = t.guidedTour.steps.find((item: { id: string }) => item.id === 'welcome')?.title;
  const icon = brandIconUrl();

  return (
    <div className="p-tour-root">
      <div className="p-tour-dim-full" aria-hidden />
      <div
        ref={cardRef}
        className="p-tour-card p-tour-card--center p-tour-welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="p-tour-welcome-title"
        aria-describedby="p-tour-welcome-lead"
      >
        <div className="p-tour-card-inner p-tour-welcome-grid">
          <div className="p-tour-welcome-main">
            <div className="p-tour-welcome-brand">
              {icon ? <img src={icon} width={40} height={40} alt="" /> : null}
              <span>KCGLMS+</span>
            </div>
            <span className="p-tour-welcome-kicker">{copy.kicker}</span>
            <h2 id="p-tour-welcome-title">{title}</h2>
            <p id="p-tour-welcome-lead" className="p-tour-welcome-lead">
              {copy.lead}
            </p>

            <div className="p-tour-welcome-flow">
              <span className="p-tour-welcome-flow-title">{copy.flowTitle}</span>
              <ol>
                {copy.flow.map((label: string, i: number) => (
                  <li key={label}>
                    <span aria-hidden>{i + 1}</span>
                    {label}
                  </li>
                ))}
              </ol>
            </div>

            <div className="p-tour-welcome-actions">
              <button
                type="button"
                className="p-tour-primary p-tour-welcome-start"
                onClick={onStart}
              >
                {copy.start}
              </button>
              <button type="button" className="p-tour-skip" onClick={onLater}>
                {copy.later}
              </button>
            </div>
            <p className="p-tour-welcome-hint">{copy.laterHint}</p>
          </div>

          <ul className="p-tour-welcome-highlights">
            {copy.highlights.map((item: { title: string; body: string }, i: number) => (
              <li key={item.title} style={{ animationDelay: `${120 + i * 70}ms` }}>
                <span className="p-tour-welcome-icon">{HIGHLIGHT_ICONS[i]}</span>
                <span className="p-tour-welcome-highlight-text">
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
