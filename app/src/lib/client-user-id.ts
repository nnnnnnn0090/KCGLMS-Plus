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
