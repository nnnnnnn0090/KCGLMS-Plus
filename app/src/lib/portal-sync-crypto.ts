/**
 * マイリンク biko に載せる同期 JSON の AES-256-GCM 暗号化。
 */

import { readPortalSyncEncryptionSecret } from '../contract/portal-sync-secret';

export const PORTAL_SYNC_WIRE_PREFIX = '~' as const;
export const PORTAL_SYNC_WIRE_PREFIX_LEGACY = 'KCGLMS1.' as const;

const WIRE_PREFIXES = [PORTAL_SYNC_WIRE_PREFIX, PORTAL_SYNC_WIRE_PREFIX_LEGACY] as const;

const IV_BYTES = 12;
const KEY_INFO = 'kcg-portal-sync:v1';
/** 初期の圧縮実装が暗号化前に付けていた文字列形式も読み続ける。 */
const COMPRESSED_TEXT_PREFIX = '!gz.';
const GZIP_MAGIC_1 = 0x1f;
const GZIP_MAGIC_2 = 0x8b;

type ArrayBackedBytes = Uint8Array<ArrayBuffer>;

function base64UrlToBytes(value: string): ArrayBackedBytes | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function compressPlaintext(plaintext: string): Promise<ArrayBackedBytes> {
  const input = new TextEncoder().encode(plaintext);
  if (
    typeof CompressionStream === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof Response === 'undefined'
  ) {
    return input;
  }
  try {
    const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    return compressed.length < input.length ? compressed : input;
  } catch {
    return input;
  }
}

async function decompressGzip(bytes: ArrayBackedBytes): Promise<string | null> {
  if (
    typeof DecompressionStream === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof Response === 'undefined'
  ) {
    return null;
  }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const decompressed = await new Response(stream).arrayBuffer();
    return new TextDecoder().decode(decompressed);
  } catch {
    return null;
  }
}

async function decodePlaintext(bytes: ArrayBackedBytes): Promise<string | null> {
  if (bytes[0] === GZIP_MAGIC_1 && bytes[1] === GZIP_MAGIC_2) {
    return decompressGzip(bytes);
  }
  const plaintext = new TextDecoder().decode(bytes);
  if (!plaintext.startsWith(COMPRESSED_TEXT_PREFIX)) return plaintext;
  const legacyCompressed = base64UrlToBytes(plaintext.slice(COMPRESSED_TEXT_PREFIX.length));
  return legacyCompressed ? decompressGzip(legacyCompressed) : null;
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${KEY_INFO}:${secret}`),
  );
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function isEncryptedPortalSyncWire(text: string): boolean {
  return WIRE_PREFIXES.some((prefix) => text.startsWith(prefix));
}

function stripWirePrefix(wire: string): string | null {
  for (const prefix of WIRE_PREFIXES) {
    if (wire.startsWith(prefix)) return wire.slice(prefix.length);
  }
  return null;
}

export async function encryptPortalSyncPayload(
  plaintext: string,
  secret = readPortalSyncEncryptionSecret(),
): Promise<string | null> {
  if (!secret) return null;
  const encodedPlaintext = await compressPlaintext(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(secret);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encodedPlaintext),
  );
  const wire = new Uint8Array(iv.length + ciphertext.length);
  wire.set(iv, 0);
  wire.set(ciphertext, iv.length);
  return `${PORTAL_SYNC_WIRE_PREFIX}${bytesToBase64Url(wire)}`;
}

export async function decryptPortalSyncPayload(
  wire: string,
  secret = readPortalSyncEncryptionSecret(),
): Promise<string | null> {
  if (!secret || !isEncryptedPortalSyncWire(wire)) return null;
  const encoded = stripWirePrefix(wire);
  if (!encoded) return null;
  const bytes = base64UrlToBytes(encoded);
  if (!bytes || bytes.length <= IV_BYTES) return null;

  const iv = bytes.slice(0, IV_BYTES);
  const ciphertext = bytes.slice(IV_BYTES);
  try {
    const key = await deriveAesKey(secret);
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext),
    );
    return decodePlaintext(plaintext);
  } catch {
    return null;
  }
}
