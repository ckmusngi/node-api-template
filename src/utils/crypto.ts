import crypto from 'node:crypto';

/** URL-safe random token suitable for refresh, reset and verification tokens. */
export function generateToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Tokens are stored as SHA-256 hashes so a database leak does not expose usable tokens.
 * They are high-entropy random values, so a fast hash (unlike passwords) is appropriate.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export function hmacSha256(secret: string, payload: string | Buffer): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function sha256(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}
