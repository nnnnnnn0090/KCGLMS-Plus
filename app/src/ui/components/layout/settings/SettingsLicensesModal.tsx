/**
 * 設定パネルから開くサードパーティライセンス一覧モーダル。
 * 「ライブラリ」「フォント」タブで区分する。
 */

import { createPortal } from 'react-dom';
import { useState, type RefObject } from 'react';
import { useI18n } from '../../../../i18n';

interface ThirdPartyLicense {
  name: string;
  license: string;
  copyright: string;
  url: string;
}

type LicensesTab = 'libraries' | 'fonts';

const LIBRARY_LICENSES: ThirdPartyLicense[] = [
  {
    name: 'KCGLMS+',
    license: 'GPL-3.0',
    copyright: 'Copyright (c) 2026 nnnnnnn0090',
    url: 'https://github.com/nnnnnnn0090/kcg-portal-redesign-project/blob/main/LICENSE',
  },
  {
    name: 'DOMPurify',
    license: 'MPL-2.0 OR Apache-2.0',
    copyright: 'Copyright 2015 Mario Heiderich',
    url: 'https://github.com/cure53/DOMPurify/blob/3.4.11/LICENSE',
  },
  {
    name: 'marked',
    license: 'MIT',
    copyright: 'Copyright (c) 2018+, MarkedJS; Copyright (c) 2011-2018, Christopher Jeffrey',
    url: 'https://github.com/markedjs/marked/blob/v18.0.5/LICENSE.md',
  },
  {
    name: 'React',
    license: 'MIT',
    copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates.',
    url: 'https://github.com/facebook/react/blob/v19.2.5/LICENSE',
  },
  {
    name: 'React DOM',
    license: 'MIT',
    copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates.',
    url: 'https://github.com/facebook/react/blob/v19.2.5/LICENSE',
  },
  {
    name: 'Motion Icons React',
    license: 'MIT',
    copyright: 'Copyright (c) 2025 Gravityy',
    url: 'https://github.com/Garvit1000/motion-icons/blob/main/LICENSE',
  },
  {
    name: 'Lucide',
    license: 'ISC (some icons: MIT)',
    copyright: 'Copyright (c) 2026 Lucide Icons and Contributors',
    url: 'https://github.com/lucide-icons/lucide/blob/main/LICENSE',
  },
];

const FONT_LICENSES: ThirdPartyLicense[] = [
  {
    name: 'Zen Maru Gothic',
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright 2021 The Zen Maru Gothic Project Authors',
    url: 'https://github.com/google/fonts/blob/main/ofl/zenmarugothic/OFL.txt',
  },
  {
    name: 'Noto Sans JP',
    license: 'SIL Open Font License 1.1',
    copyright:
      "Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'",
    url: 'https://github.com/google/fonts/blob/main/ofl/notosansjp/OFL.txt',
  },
  {
    name: 'M PLUS Rounded 1c',
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright 2016 The Rounded M+ Project Authors',
    url: 'https://github.com/google/fonts/blob/main/ofl/roundedmplus1c/OFL.txt',
  },
  {
    name: 'Zen Kaku Gothic New',
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright 2022 The Zen Kaku Gothic Project Authors',
    url: 'https://github.com/google/fonts/blob/main/ofl/zenkakugothicnew/OFL.txt',
  },
  {
    name: 'BIZ UDPGothic',
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright 2022 The BIZ UDGothic Project Authors',
    url: 'https://github.com/google/fonts/blob/main/ofl/bizudpgothic/OFL.txt',
  },
  {
    name: 'IBM Plex Sans JP',
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"',
    url: 'https://github.com/google/fonts/blob/main/ofl/ibmplexsansjp/OFL.txt',
  },
];

export interface SettingsLicensesModalProps {
  overlayEl: HTMLElement | null;
  mounted: boolean;
  closing: boolean;
  modalRootRef: RefObject<HTMLDivElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onRequestClose: () => void;
}

function LicenseList({
  items,
  licenseTypeLabel,
  copyrightLabel,
}: {
  items: ThirdPartyLicense[];
  licenseTypeLabel: string;
  copyrightLabel: string;
}) {
  return (
    <div className="p-licenses-list">
      {items.map((item) => (
        <article className="p-license-item" key={item.name}>
          <h3 className="p-license-name">
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {item.name}
            </a>
          </h3>
          <dl className="p-license-meta">
            <div>
              <dt>{licenseTypeLabel}</dt>
              <dd>{item.license}</dd>
            </div>
            <div>
              <dt>{copyrightLabel}</dt>
              <dd>{item.copyright}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

export function SettingsLicensesModal({
  overlayEl,
  mounted,
  closing,
  modalRootRef,
  closeButtonRef,
  onRequestClose,
}: SettingsLicensesModalProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<LicensesTab>('libraries');
  if (!mounted || !overlayEl) return null;

  const intro =
    tab === 'libraries' ? t.settings.licensesIntroLibraries : t.settings.licensesIntroFonts;
  const items = tab === 'libraries' ? LIBRARY_LICENSES : FONT_LICENSES;
  const selectTab = (next: LicensesTab) => {
    setTab(next);
    window.requestAnimationFrame(() => {
      document.getElementById(`p-licenses-tab-${next}`)?.focus();
    });
  };

  return createPortal(
    <div
      ref={modalRootRef}
      id="p-licenses-modal-root"
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
        aria-labelledby="p-licenses-modal-title"
      >
        <div className="p-changelog-modal-head">
          <h2 id="p-licenses-modal-title">{t.settings.licensesTitle}</h2>
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
          <div
            className="p-licenses-tabs"
            role="tablist"
            aria-label={t.settings.licensesTitle}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              selectTab(tab === 'libraries' ? 'fonts' : 'libraries');
            }}
          >
            <button
              type="button"
              role="tab"
              id="p-licenses-tab-libraries"
              aria-selected={tab === 'libraries'}
              aria-controls="p-licenses-panel"
              tabIndex={tab === 'libraries' ? 0 : -1}
              className={tab === 'libraries' ? 'is-active' : undefined}
              onClick={() => setTab('libraries')}
            >
              {t.settings.licensesTabLibraries}
            </button>
            <button
              type="button"
              role="tab"
              id="p-licenses-tab-fonts"
              aria-selected={tab === 'fonts'}
              aria-controls="p-licenses-panel"
              tabIndex={tab === 'fonts' ? 0 : -1}
              className={tab === 'fonts' ? 'is-active' : undefined}
              onClick={() => setTab('fonts')}
            >
              {t.settings.licensesTabFonts}
            </button>
          </div>
          <div
            id="p-licenses-panel"
            role="tabpanel"
            aria-labelledby={
              tab === 'libraries' ? 'p-licenses-tab-libraries' : 'p-licenses-tab-fonts'
            }
          >
            <p className="p-licenses-intro">{intro}</p>
            <LicenseList
              items={items}
              licenseTypeLabel={t.settings.licenseType}
              copyrightLabel={t.settings.licenseCopyright}
            />
          </div>
        </div>
      </div>
    </div>,
    overlayEl,
  );
}
