/**
 * 拡張のインストール日時・最終バージョン更新日時を storage に記録する。
 */

import { readExtensionVersion } from './extension-version';
import storage from './storage';
import { SK } from '../shared/constants';

export interface ClientLifecycleTimestamps {
  installAt: string;
  lastUpdatedAt: string;
}

let loadPromise: Promise<ClientLifecycleTimestamps> | null = null;

function normalizeIso(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

async function ensureClientLifecycleTimestamps(): Promise<ClientLifecycleTimestamps> {
  const version = readExtensionVersion();
  const data = await storage.get([
    SK.clientInstallAt,
    SK.clientLastUpdatedAt,
    SK.clientLastKnownVersion,
  ]);

  let installAt = normalizeIso(data[SK.clientInstallAt]);
  let lastUpdatedAt = normalizeIso(data[SK.clientLastUpdatedAt]);
  const clientLastKnownVersion = data[SK.clientLastKnownVersion];
  const lastKnownVersion =
    typeof clientLastKnownVersion === 'string' ? clientLastKnownVersion.trim() : '';

  const now = new Date().toISOString();
  const toSet: Record<string, string> = {};

  if (!installAt) {
    installAt = now;
    toSet[SK.clientInstallAt] = installAt;
  }
  if (!lastUpdatedAt) {
    lastUpdatedAt = now;
    toSet[SK.clientLastUpdatedAt] = lastUpdatedAt;
  }

  if (version && version !== lastKnownVersion) {
    if (lastKnownVersion) {
      lastUpdatedAt = now;
      toSet[SK.clientLastUpdatedAt] = lastUpdatedAt;
    }
    toSet[SK.clientLastKnownVersion] = version;
  }

  if (Object.keys(toSet).length > 0) await storage.set(toSet);

  return { installAt, lastUpdatedAt };
}

/** 記録済みのインストール日時・最終更新日時を返す（無ければ初期化） */
export function getClientLifecycleTimestamps(): Promise<ClientLifecycleTimestamps> {
  if (!loadPromise) {
    loadPromise = ensureClientLifecycleTimestamps();
  }
  return loadPromise;
}
