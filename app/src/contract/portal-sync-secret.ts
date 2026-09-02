/**
 * マイリンク同期 JSON の暗号化鍵（`VITE_TELEMETRY_HMAC_SECRET` と同一）。
 */

export function readPortalSyncEncryptionSecret(): string | null {
  const fromImport = import.meta.env.VITE_TELEMETRY_HMAC_SECRET;
  if (typeof fromImport === 'string' && fromImport.trim().length >= 16) {
    return fromImport.trim();
  }
  const fromProcess =
    typeof process !== 'undefined' ? process.env.VITE_TELEMETRY_HMAC_SECRET : undefined;
  if (typeof fromProcess === 'string' && fromProcess.trim().length >= 16) {
    return fromProcess.trim();
  }
  return null;
}
