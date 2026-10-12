import { hasPermission } from '../../src/config/rbac';
import { sniffFileType } from '../../src/lib/storage';
import { signWebhook, verifyWebhookSignature } from '../../src/modules/webhooks/webhook.signature';
import { signAccessToken, verifyAccessToken } from '../../src/modules/auth/token.service';
import { generateToken, hashToken, safeEqual } from '../../src/utils/crypto';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../src/utils/password';
import jwt from 'jsonwebtoken';

describe('crypto', () => {
  it('generates unique url-safe tokens and stable hashes', () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(generateToken()).not.toBe(a);
    expect(hashToken(a)).toHaveLength(64);
    expect(hashToken(a)).toBe(hashToken(a));
  });

  it('compares in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('passwords', () => {
  it('hashes with bcrypt and verifies', async () => {
    const hash = await hashPassword('Secret123!');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword('Secret123!', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    await expect(burnPasswordCheck('anything')).resolves.toBeUndefined();
  });
});

describe('access tokens', () => {
  const user = { id: '3f1c2b8e-8a7d-4a51-9f5b-2f6a1d0c9e44', role: 'user' as const, tenantId: null };

  it('round-trips claims', () => {
    const payload = verifyAccessToken(signAccessToken(user));
    expect(payload.sub).toBe(user.id);
    expect(payload.role).toBe('user');
  });

  it('rejects tampered, foreign and expired tokens', () => {
    const token = signAccessToken(user);
    expect(() => verifyAccessToken(`${token}x`)).toThrow(/Invalid access token/);
    expect(() => verifyAccessToken(jwt.sign({ sub: user.id }, 'another-secret-another-secret-123'))).toThrow(/Invalid/);
    const expired = jwt.sign(
      { role: 'user', exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_ACCESS_SECRET ?? 'test-secret-that-is-at-least-32-characters-long',
      {
        subject: user.id,
        issuer: 'node-api-template',
        audience: 'node-api-template-clients',
      },
    );
    expect(() => verifyAccessToken(expired)).toThrow(/expired/);
  });

  it('rejects the "none" algorithm', () => {
    const unsigned = jwt.sign({ sub: user.id, role: 'admin' }, '', { algorithm: 'none' });
    expect(() => verifyAccessToken(unsigned)).toThrow();
  });
});

describe('rbac', () => {
  it('grants permissions by role', () => {
    expect(hasPermission('user', 'notes:write:own')).toBe(true);
    expect(hasPermission('user', 'users:manage')).toBe(false);
    expect(hasPermission('admin', 'users:manage')).toBe(true);
  });
});

describe('webhook signatures', () => {
  const secret = 'whsec';
  const body = Buffer.from('{"id":"evt_1"}');

  it('accepts a valid signature', () => {
    expect(verifyWebhookSignature(secret, body, signWebhook(secret, body), 300)).toEqual({ valid: true });
  });

  it('rejects tampering, wrong secrets, stale timestamps and junk', () => {
    const header = signWebhook(secret, body);
    expect(verifyWebhookSignature(secret, Buffer.from('{"id":"evt_2"}'), header, 300).valid).toBe(false);
    expect(verifyWebhookSignature('other', body, header, 300).valid).toBe(false);
    const old = signWebhook(secret, body, Math.floor(Date.now() / 1000) - 3600);
    expect(verifyWebhookSignature(secret, body, old, 300)).toEqual({
      valid: false,
      reason: 'timestamp outside tolerance',
    });
    expect(verifyWebhookSignature(secret, body, undefined, 300).valid).toBe(false);
    expect(verifyWebhookSignature(secret, body, 'garbage', 300).valid).toBe(false);
  });
});

describe('file type sniffing', () => {
  it('detects real types from magic bytes', () => {
    expect(sniffFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mime).toBe('image/png');
    expect(sniffFileType(Buffer.from('%PDF-1.7'))?.mime).toBe('application/pdf');
    expect(sniffFileType(Buffer.from('<script>alert(1)</script>'))).toBeNull();
  });
});
