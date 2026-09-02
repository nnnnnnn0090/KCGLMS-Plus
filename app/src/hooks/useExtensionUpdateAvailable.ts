/**
 * changelog.json の最新バージョンと manifest を比較し、更新が必要か返す。
 */

import { useEffect, useState } from 'react';
import {
  fetchLatestExtensionVersion,
  isExtensionUpdateAvailable,
} from '../lib/fetch-latest-extension-version';
import { readExtensionVersion } from '../lib/extension-version';

/** UI 確認用: true の間は更新通知を常時表示（本番前に false に戻す） */
const FORCE_SHOW_UPDATE_NOTICE = false;

export function useExtensionUpdateAvailable(): {
  latestVersion: string | null;
  updateAvailable: boolean;
} {
  const current = readExtensionVersion();
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchLatestExtensionVersion().then((latest) => {
      if (!cancelled) setLatestVersion(latest);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateAvailable =
    FORCE_SHOW_UPDATE_NOTICE || isExtensionUpdateAvailable(current, latestVersion);
  const displayLatest = latestVersion ?? (FORCE_SHOW_UPDATE_NOTICE ? '9.9.9' : null);

  return {
    latestVersion: displayLatest,
    updateAvailable,
  };
}
