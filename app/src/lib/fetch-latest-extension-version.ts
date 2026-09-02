/**
 * 配布サイトの changelog.json から最新 manifest バージョンを取得する。
 */

import { parseChangelogJson } from '../ui/components/layout/settings/settings-changelog';
import { CHANGELOG_JSON_URL } from '../shared/constants';
import { semverGreater } from './semver';
import { readExtensionVersion } from './extension-version';

let inFlight: Promise<string | null> | null = null;
let cachedLatest: string | null | undefined;

async function loadLatestFromChangelog(): Promise<string | null> {
  const res = await fetch(`${CHANGELOG_JSON_URL}?_=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const parsed = parseChangelogJson((await res.json()) as unknown);
  return parsed?.[0]?.version ?? null;
}

/** 最新バージョン文字列。取得失敗時は null（次回呼び出しで再試行） */
export function fetchLatestExtensionVersion(): Promise<string | null> {
  if (cachedLatest !== undefined) return Promise.resolve(cachedLatest);
  if (!inFlight) {
    inFlight = loadLatestFromChangelog()
      .then((v) => {
        cachedLatest = v;
        return v;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** インストール中の manifest が changelog の最新より古いか */
export function isExtensionUpdateAvailable(current: string, latest: string | null): boolean {
  if (!current || !latest) return false;
  return semverGreater(latest, current);
}

/** 現在の manifest と changelog を比較して更新要否を返す */
export async function checkExtensionUpdateAvailable(): Promise<{
  current: string;
  latest: string | null;
  updateAvailable: boolean;
}> {
  const current = readExtensionVersion();
  const latest = await fetchLatestExtensionVersion();
  return {
    current,
    latest,
    updateAvailable: isExtensionUpdateAvailable(current, latest),
  };
}
