/**
 * 初回チュートリアルの「ほかの端末と設定をそろえるか」を選ぶ手順。
 * 同期は既定でオフなので、ここで選んだ人だけオンになる。
 * existing: マイリンクに既存の設定が見つかったとき（ようこその直後に出す）。
 * 合わせると、どちらに合わせるかを改めて聞かずにポータル側を反映する。
 */

import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import type { I18nMessages } from '../../../../i18n/messages';
import {
  alignWithPortalSyncData,
  getPortalMyLinksSyncEnabled,
  readPortalSyncStatus,
  setPortalMyLinksSyncEnabled,
} from '../../../../services/portal-settings-sync';

type SyncPhase = 'idle' | 'working' | 'done' | 'later' | 'choose';

interface TourSyncStepProps {
  stepId: string;
  existing?: boolean;
  t: I18nMessages;
  cardRef: RefObject<HTMLDivElement | null>;
  dockExiting: boolean;
  previewGuard: ReactNode;
  progress: ReactNode;
  actions: ReactNode;
}

export function TourSyncStep({
  stepId,
  existing = false,
  t,
  cardRef,
  dockExiting,
  previewGuard,
  progress,
  actions,
}: TourSyncStepProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<SyncPhase>('idle');

  useEffect(() => {
    let cancelled = false;
    void getPortalMyLinksSyncEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (next: boolean) => {
    if (phase === 'working') return;
    setEnabled(next);
    if (!next) {
      setPhase('idle');
      await setPortalMyLinksSyncEnabled(false);
      return;
    }
    setPhase('working');
    try {
      if (existing) await alignWithPortalSyncData();
      else await setPortalMyLinksSyncEnabled(true);
      const status = await readPortalSyncStatus();
      if (status.issue === 'needs-choice') setPhase('choose');
      else setPhase(status.issue ? 'later' : 'done');
    } catch {
      setPhase('later');
    }
  };

  const g = t.guidedTour;
  const copy = existing
    ? {
        title: g.syncFoundTitle,
        body: g.syncFoundBody,
        on: g.syncFoundOn,
        onHint: g.syncFoundOnHint,
        off: g.syncFoundOff,
        offHint: g.syncFoundOffHint,
      }
    : {
        title: g.syncTitle,
        body: g.syncBody,
        on: g.syncOn,
        onHint: g.syncOnHint,
        off: g.syncOff,
        offHint: g.syncOffHint,
      };

  const message: Record<SyncPhase, string> = {
    idle: t.guidedTour.syncHint,
    working: t.guidedTour.syncWorking,
    done: t.guidedTour.syncDone,
    later: t.guidedTour.syncLater,
    choose: t.guidedTour.syncAskInSettings,
  };

  const option = (value: boolean, title: string, hint: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={enabled === value}
      disabled={phase === 'working'}
      className={`p-tour-week-start-option p-tour-sync-option${enabled === value ? ' is-active' : ''}`}
      onClick={() => void choose(value)}
    >
      <span className="p-tour-sync-option-title">{title}</span>
      <span className="p-tour-sync-option-hint">{hint}</span>
    </button>
  );

  return (
    <div className="p-tour-root p-tour-root--theme">
      {previewGuard}
      <div
        key={stepId}
        ref={cardRef}
        className={`p-tour-theme-dock p-tour-week-start-dock${dockExiting ? ' is-exiting' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="p-tour-sync-title"
        aria-describedby="p-tour-sync-body"
      >
        <div className="p-tour-theme-dock-inner">
          <div className="p-tour-theme-copy">
            <div>
              <span className="p-tour-eyebrow">{t.guidedTour.themeEyebrow}</span>
              <h2 id="p-tour-sync-title">{copy.title}</h2>
              <p id="p-tour-sync-body">{copy.body}</p>
            </div>
            {progress}
          </div>

          <div className="p-tour-week-start-options" role="radiogroup" aria-label={copy.title}>
            {option(true, copy.on, copy.onHint)}
            {option(false, copy.off, copy.offHint)}
          </div>

          <div className="p-tour-theme-footer p-tour-week-start-footer">
            <p role="status" aria-live="polite">
              {message[phase]}
            </p>
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}
