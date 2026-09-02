import { describe, expect, it } from 'vitest';
import { buildTelemetryCanonicalString, signTelemetryRequest } from '../contract/telemetry-auth';

const TEST_SECRET = 'test-telemetry-hmac-secret-for-unit-tests';

async function verifyWithSecret(
  secret: string,
  signature: string,
  canonical: string,
): Promise<boolean> {
  const normalized = signature.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const provided = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical)),
  );
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) diff |= provided[i]! ^ expected[i]!;
  return diff === 0;
}

describe('telemetry-auth', () => {
  it('signs requests with shared secret', async () => {
    const signed = await signTelemetryRequest(
      TEST_SECRET,
      'POST',
      '/survey-response',
      1_710_000_000_000,
    );
    const canonical = buildTelemetryCanonicalString(signed.timestamp, 'POST', '/survey-response');
    await expect(verifyWithSecret(TEST_SECRET, signed.signature, canonical)).resolves.toBe(true);
  });
});
