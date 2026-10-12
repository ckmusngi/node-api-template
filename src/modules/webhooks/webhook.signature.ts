import { hmacSha256, safeEqual } from '../../utils/crypto';
import { toUnixSeconds } from '../../utils/date';

export const SIGNATURE_HEADER = 'X-Webhook-Signature';

/**
 * Signature format (Stripe-style): `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`.
 * Signing the timestamp prevents an attacker replaying an old payload with a fresh header.
 */
export function signWebhook(secret: string, rawBody: string | Buffer, timestamp = toUnixSeconds()): string {
  const payload = `${timestamp}.${rawBody.toString()}`;
  return `t=${timestamp},v1=${hmacSha256(secret, payload)}`;
}

export type SignatureResult = { valid: true } | { valid: false; reason: string };

export function verifyWebhookSignature(
  secret: string,
  rawBody: Buffer,
  header: string | undefined,
  toleranceSeconds: number,
  now = toUnixSeconds(),
): SignatureResult {
  if (!header) return { valid: false, reason: 'missing signature' };
  const parts: Record<string, string | undefined> = Object.fromEntries(
    header.split(',').map((part) => {
      const [k, ...v] = part.trim().split('=');
      return [k ?? '', v.join('=')] as const;
    }),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isInteger(timestamp) || !signature) return { valid: false, reason: 'malformed signature' };
  if (Math.abs(now - timestamp) > toleranceSeconds) return { valid: false, reason: 'timestamp outside tolerance' };
  const expected = hmacSha256(secret, `${timestamp}.${rawBody.toString()}`);
  return safeEqual(expected, signature) ? { valid: true } : { valid: false, reason: 'signature mismatch' };
}
