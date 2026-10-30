/** 匿名ユーザー ID。端末キャッシュとマイリンク同期 JSON に保存する。 */

import { SK } from '../shared/constants';
import storage from './storage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function generateClientUserId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function normalizeClientUserId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return UUID_RE.test(s) ? s : null;
}

/** 端末キャッシュ上の clientUserId を確定する。 */
export async function ensureClientUserIdInMemory(): Promise<string> {
  const cached = normalizeClientUserId((await storage.get(SK.clientUserId))[SK.clientUserId]);
  if (cached) return cached;

  // 他の端末で作られた ID が同期で届いたら、そちらを優先する。
  const id = generateClientUserId();
  await storage.setDefaults({ [SK.clientUserId]: id });
  return id;
}

/** @deprecated ensurePortalExtensionBootstrapped 後に ensureClientUserIdInMemory を使う */
export async function getOrCreateClientUserId(): Promise<string> {
  const { ensurePortalExtensionBootstrapped } = await import('../services/portal-settings-sync');
  await ensurePortalExtensionBootstrapped();
  return ensureClientUserIdInMemory();
}

/**
 * お知らせ・アンケートなどに付ける ID。初回チュートリアル（ほかの端末と揃えるかの選択を含む）が
 * 済むまでは作らず null を返す（その間は ID なしで送る）。ほかの端末の ID が同期で届く前に
 * 使い捨ての ID を作り、別の利用者として数えさせないため。
 */
export async function readClientUserIdForTelemetry(): Promise<string | null> {
  const { ensurePortalExtensionBootstrapped, waitForPortalSyncIdle } =
    await import('../services/portal-settings-sync');
  await ensurePortalExtensionBootstrapped();
  const snap = await storage.get([SK.clientUserId, SK.portalGuidedTourDone]);
  const cached = normalizeClientUserId(snap[SK.clientUserId]);
  if (cached) return cached;
  if (snap[SK.portalGuidedTourDone] !== true) return null;
  // チュートリアルで「揃える」を選んだ直後なら、ほかの端末の ID が届くのを待ってから決める。
  await waitForPortalSyncIdle();
  return ensureClientUserIdInMemory();
}
