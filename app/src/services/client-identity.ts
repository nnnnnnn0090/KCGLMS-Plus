/**
 * 拡張機能インストールごとの匿名ユーザー ID とライフサイクル記録（F-042/F-043）。
 */

export { getOrCreateClientUserId, readClientUserIdForTelemetry } from '../lib/client-user-id';

export {
  getClientLifecycleTimestamps,
  type ClientLifecycleTimestamps,
} from '../lib/extension-client-lifecycle';

import {
  CLIENT_SIGNATURE_HEADER,
  CLIENT_TIMESTAMP_HEADER,
  signTelemetryRequest,
} from '../contract/telemetry-auth';
import {
  CLIENT_INSTALL_AT_HEADER,
  CLIENT_LAST_UPDATED_AT_HEADER,
  CLIENT_USER_ID_HEADER,
  EXTENSION_VERSION_HEADER,
} from '../contract/origins';
import { readEmbeddedTelemetrySecret } from '../contract/telemetry-secret';
import { readExtensionVersion } from '../lib/extension-version';
import { getOrCreateClientUserId, readClientUserIdForTelemetry } from '../lib/client-user-id';
import { getClientLifecycleTimestamps } from '../lib/extension-client-lifecycle';

/**
 * notice / survey / community-access 等へ付与するテレメトリヘッダー。
 * ID は初回チュートリアルが済むまで付けない（requireUserId のときは作ってでも付ける）。
 */
export async function buildClientTelemetryHeaders(
  method: string,
  pathname: string,
  { requireUserId = false }: { requireUserId?: boolean } = {},
): Promise<Record<string, string>> {
  const [userId, lifecycle] = await Promise.all([
    requireUserId ? getOrCreateClientUserId() : readClientUserIdForTelemetry(),
    getClientLifecycleTimestamps(),
  ]);
  const headers: Record<string, string> = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    [CLIENT_INSTALL_AT_HEADER]: lifecycle.installAt,
    [CLIENT_LAST_UPDATED_AT_HEADER]: lifecycle.lastUpdatedAt,
  };
  if (userId) headers[CLIENT_USER_ID_HEADER] = userId;
  const version = readExtensionVersion();
  if (version) headers[EXTENSION_VERSION_HEADER] = version;

  const secret = readEmbeddedTelemetrySecret();
  if (secret) {
    const signed = await signTelemetryRequest(secret, method, pathname);
    headers[CLIENT_TIMESTAMP_HEADER] = signed.timestamp;
    headers[CLIENT_SIGNATURE_HEADER] = signed.signature;
  }

  return headers;
}
