/**
 * 「みんなの活動」入口の公開可否確認（F-045）。
 */

import {
  COMMUNITY_ACCESS_URL,
  isAllowedCommunityApiOrigin,
  normalizeCommunityApiOrigin,
} from '../contract/origins';
import { COMMUNITY_BOUNDARY_TIMING } from '@community-boundary/timing';
import { storageRepo } from '../platform/storage/repo';
import { buildClientTelemetryHeaders } from './client-identity';

export interface CommunityAccessResult {
  enabled: boolean;
  apiOrigin: string;
}

type CommunityAccessResponse = { enabled?: unknown; apiOrigin?: unknown };

export function parseCommunityAccessResponse(
  result: CommunityAccessResponse,
): CommunityAccessResult {
  const apiOrigin = normalizeCommunityApiOrigin(result.apiOrigin);
  const enabled =
    result.enabled === true && apiOrigin.length > 0 && isAllowedCommunityApiOrigin(apiOrigin);
  return { enabled, apiOrigin: enabled ? apiOrigin : '' };
}

export async function getCommunityDisclaimerAccepted(): Promise<boolean> {
  return storageRepo.getCommunityDisclaimerAccepted();
}

export async function acceptCommunityDisclaimer(): Promise<void> {
  await storageRepo.setCommunityDisclaimerAccepted(true);
}

/** 匿名 UUID で community-access を問い合わせる */
export async function fetchCommunityAccess(signal?: AbortSignal): Promise<CommunityAccessResult> {
  // 入室の判定は ID ごとなので、まだ無ければここで作る。
  const headers = await buildClientTelemetryHeaders('GET', '/community-access', {
    requireUserId: true,
  });
  const timeoutSignal = AbortSignal.timeout(COMMUNITY_BOUNDARY_TIMING.accessTimeoutMs);
  const mergedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const response = await fetch(COMMUNITY_ACCESS_URL, {
    cache: 'no-store',
    headers,
    signal: mergedSignal,
  });
  if (!response.ok) throw new Error(String(response.status));
  const result = (await response.json()) as CommunityAccessResponse;
  return parseCommunityAccessResponse(result);
}
