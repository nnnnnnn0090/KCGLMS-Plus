/**
 * 設定パネルから開く「更新履歴」モーダル（オーバーレイルートへの portal）。
 */

import { createPortal } from 'react-dom';
import type { RefObject } from 'react';
import { useI18n } from '../../../../i18n';
import type { ParsedChangelogRelease } from './settings-changelog';

export interface SettingsChangelogModalProps {
  overlayEl: HTMLElement | null;
  mounted: boolean;
  closing: boolean;
  loading: boolean;
  err: string | null;
  list: ParsedChangelogRelease[] | null;
  modalRootRef: RefObject<HTMLDivElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onRequestClose: () => void;
}

export function SettingsChangelogModal({
  overlayEl,
  mounted,
  closing,
  loading,
  err,
  list,
  modalRootRef,
  closeButtonRef,
  onRequestClose,
}: SettingsChangelogModalProps) {
  const { t } = useI18n();
  if (!mounted || !overlayEl) return null;
  return createPortal(
    <div
      ref={modalRootRef}
      id="p-changelog-modal-root"
      className={`p-changelog-modal-root${closing ? ' is-closing' : ''}`}
      role="presentation"
    >
      <button
        type="button"
        className="p-changelog-modal-backdrop"
        aria-label={t.common.close}
        onClick={onRequestClose}
      />
      <div
        className="p-changelog-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="p-changelog-modal-title"
      >
        <div className="p-changelog-modal-head">
          <h2 id="p-changelog-modal-title">{t.settings.changelogTitle}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="p-changelog-modal-close"
            aria-label={t.common.close}
            onClick={onRequestClose}
          >
            ×
          </button>
        </div>
        <div className="p-changelog-modal-body">
          {loading ? <p className="p-changelog-modal-status">{t.common.loading}</p> : null}
          {err ? (
            <p className="p-changelog-modal-status p-changelog-modal-status--error" role="alert">
              {err}
            </p>
          ) : null}
          {!loading && list && list.length > 0 ? (
            <div className="p-settings-changelog-list">
              {list.map((rel) => (
                <article key={rel.version} className="p-settings-changelog-rel">
                  <h3 className="p-settings-changelog-rel-heading">
                    {rel.version}
                    {rel.date ? ` · ${rel.date}` : ''}
                  </h3>
                  {rel.title ? <p className="p-settings-changelog-rel-title">{rel.title}</p> : null}
                  {rel.highlights.length > 0 ? (
                    <ul className="p-settings-changelog-ul">
                      {rel.highlights.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  ) : null}
                  {rel.notes.map((t, i) => (
                    <p key={`n-${rel.version}-${i}`} className="p-settings-changelog-note">
                      {t}
                    </p>
                  ))}
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    overlayEl,
  );
}
