import { describe, expect, it } from 'vitest';
import {
  decryptPortalSyncPayload,
  encryptPortalSyncPayload,
  PORTAL_SYNC_WIRE_PREFIX,
  PORTAL_SYNC_WIRE_PREFIX_LEGACY,
} from './portal-sync-crypto';

const TEST_SECRET = 'vitest-portal-sync-secret-key';

async function legacyCompressedText(plaintext: string): Promise<string> {
  const input = new TextEncoder().encode(plaintext);
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `!gz.${encoded}`;
}

describe('portal-sync-crypto', () => {
  it('encrypts and decrypts portal sync payloads', async () => {
    const plaintext = '{"version":3,"updatedAt":1,"storage":{}}';
    const wire = await encryptPortalSyncPayload(plaintext, TEST_SECRET);
    expect(wire?.startsWith(PORTAL_SYNC_WIRE_PREFIX)).toBe(true);
    expect(await decryptPortalSyncPayload(wire!, TEST_SECRET)).toBe(plaintext);
  });

  it('returns null for tampered ciphertext', async () => {
    const wire = await encryptPortalSyncPayload('{"ok":true}', TEST_SECRET);
    expect(wire).toBeTruthy();
    const tampered = `${wire!.slice(0, -1)}A`;
    expect(await decryptPortalSyncPayload(tampered, TEST_SECRET)).toBeNull();
  });

  it('compresses repetitive long payloads before encryption', async () => {
    const plaintext = JSON.stringify({
      urls: Array.from({ length: 4 }, (_, index) => `${index}:${'teams-context-'.repeat(400)}`),
    });
    const wire = await encryptPortalSyncPayload(plaintext, TEST_SECRET);
    expect(wire).not.toBeNull();
    expect(wire!.length).toBeLessThan(plaintext.length / 3);
    await expect(decryptPortalSyncPayload(wire!, TEST_SECRET)).resolves.toBe(plaintext);
  });

  it('decrypts legacy wire prefix', async () => {
    const plaintext = '{"v":4,"u":1,"s":{}}';
    const wire = await encryptPortalSyncPayload(plaintext, TEST_SECRET);
    expect(wire).toBeTruthy();
    const legacyWire = `${PORTAL_SYNC_WIRE_PREFIX_LEGACY}${wire!.slice(PORTAL_SYNC_WIRE_PREFIX.length)}`;
    expect(await decryptPortalSyncPayload(legacyWire, TEST_SECRET)).toBe(plaintext);
  });

  it('decrypts the initial text-wrapped gzip representation', async () => {
    const plaintext = JSON.stringify({ urls: ['teams-context-'.repeat(100)] });
    const legacyPlaintext = await legacyCompressedText(plaintext);
    const wire = await encryptPortalSyncPayload(legacyPlaintext, TEST_SECRET);
    expect(wire).toBeTruthy();
    expect(await decryptPortalSyncPayload(wire!, TEST_SECRET)).toBe(plaintext);
  });
});
