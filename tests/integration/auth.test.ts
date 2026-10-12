import { sentMail } from '../../src/lib/mailer';
import { AuditLog, RefreshToken, User, UserToken } from '../../src/models';
import { hashToken } from '../../src/utils/crypto';
import { DEFAULT_PASSWORD, V1, api, authedUser, createUser, login } from '../helpers/factories';

const tokenFromMail = () => /token=([A-Za-z0-9_-]+)/.exec(sentMail.at(-1)!.text)![1]!;

describe('POST /auth/register', () => {
  const body = { email: 'New.User@Example.com', password: 'Password123', firstName: 'New', lastName: 'User' };

  it('creates a user, hashes the password and sends a verification email', async () => {
    const res = await api().post(`${V1}/auth/register`).send(body);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({
      email: 'new.user@example.com',
      role: 'user',
      status: 'active',
      emailVerifiedAt: null,
    });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');

    const stored = await User.scope('withPassword').findOne({ where: { email: 'new.user@example.com' } });
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(sentMail.at(-1)).toMatchObject({ to: 'new.user@example.com', subject: 'Verify your email address' });
    expect(await AuditLog.count({ where: { action: 'auth.register' } })).toBe(1);
  });

  it('ignores attempts to self-assign a role', async () => {
    const res = await api()
      .post(`${V1}/auth/register`)
      .send({ ...body, role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('user');
  });

  it('rejects duplicates and invalid input', async () => {
    await api().post(`${V1}/auth/register`).send(body).expect(201);
    const dup = await api().post(`${V1}/auth/register`).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');

    const bad = await api().post(`${V1}/auth/register`).send({ email: 'nope', password: 'weak' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(bad.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['body.email', 'body.password', 'body.firstName']),
    );
  });
});

describe('POST /auth/login', () => {
  it('returns tokens and sets an httpOnly refresh cookie', async () => {
    const user = await createUser();
    const res = await api().post(`${V1}/auth/login`).send({ email: user.email, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.tokens).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    const cookie = res.headers['set-cookie']![0]!;
    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    // Only the hash is stored.
    const stored = await RefreshToken.findOne({ where: { userId: user.id } });
    expect(stored!.tokenHash).toBe(hashToken(res.body.data.tokens.refreshToken));
  });

  it('returns the same error for unknown emails and wrong passwords', async () => {
    const user = await createUser();
    const unknown = await api().post(`${V1}/auth/login`).send({ email: 'ghost@example.com', password: 'x' });
    const wrong = await api().post(`${V1}/auth/login`).send({ email: user.email, password: 'wrong' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error).toEqual(wrong.body.error);
  });

  it('locks the account after repeated failures (LOGIN_MAX_ATTEMPTS=3 in tests)', async () => {
    const user = await createUser();
    for (let i = 0; i < 3; i++) {
      await api().post(`${V1}/auth/login`).send({ email: user.email, password: 'wrong' }).expect(401);
    }
    const locked = await api().post(`${V1}/auth/login`).send({ email: user.email, password: DEFAULT_PASSWORD });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(await AuditLog.count({ where: { action: 'auth.account_locked' } })).toBe(1);
  });

  it('blocks suspended and inactive accounts', async () => {
    const suspended = await createUser({ status: 'suspended' });
    const inactive = await createUser({ status: 'inactive' });
    const r1 = await api().post(`${V1}/auth/login`).send({ email: suspended.email, password: DEFAULT_PASSWORD });
    const r2 = await api().post(`${V1}/auth/login`).send({ email: inactive.email, password: DEFAULT_PASSWORD });
    expect([r1.status, r1.body.error.code]).toEqual([403, 'ACCOUNT_SUSPENDED']);
    expect([r2.status, r2.body.error.code]).toEqual([403, 'ACCOUNT_INACTIVE']);
  });
});

describe('refresh token rotation', () => {
  it('rotates tokens via body or cookie', async () => {
    const { refreshToken } = await authedUser();
    const first = await api().post(`${V1}/auth/refresh`).send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.data.tokens.refreshToken).not.toBe(refreshToken);

    const cookie = first.headers['set-cookie']![0]!.split(';')[0]!;
    const viaCookie = await api().post(`${V1}/auth/refresh`).set('Cookie', cookie).send({});
    expect(viaCookie.status).toBe(200);
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const { refreshToken } = await authedUser();
    const rotated = await api().post(`${V1}/auth/refresh`).send({ refreshToken });
    const newToken = rotated.body.data.tokens.refreshToken as string;

    const replay = await api().post(`${V1}/auth/refresh`).send({ refreshToken });
    expect(replay.status).toBe(401);

    // The legitimate newer token is now revoked too.
    const after = await api().post(`${V1}/auth/refresh`).send({ refreshToken: newToken });
    expect(after.status).toBe(401);
    expect(await AuditLog.count({ where: { action: 'auth.refresh_token_reuse' } })).toBeGreaterThanOrEqual(1);
  });

  it('rejects unknown, missing and expired tokens', async () => {
    expect(
      (
        await api()
          .post(`${V1}/auth/refresh`)
          .send({ refreshToken: 'x'.repeat(40) })
      ).status,
    ).toBe(401);
    expect((await api().post(`${V1}/auth/refresh`).send({})).status).toBe(401);

    const { user, refreshToken } = await authedUser();
    await RefreshToken.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { userId: user.id } });
    const expired = await api().post(`${V1}/auth/refresh`).send({ refreshToken });
    expect(expired.body.error.code).toBe('TOKEN_EXPIRED');
  });
});

describe('logout', () => {
  it('revokes the refresh token and clears the cookie', async () => {
    const { refreshToken, auth } = await authedUser();
    const res = await api().post(`${V1}/auth/logout`).set(auth).send({ refreshToken });
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']![0]).toMatch(/refresh_token=;/);
    expect((await api().post(`${V1}/auth/refresh`).send({ refreshToken })).status).toBe(401);
  });

  it('logout-all revokes every session', async () => {
    const { user, auth, refreshToken } = await authedUser();
    const second = await login(user.email);
    await api().post(`${V1}/auth/logout-all`).set(auth).expect(204);
    expect((await api().post(`${V1}/auth/refresh`).send({ refreshToken })).status).toBe(401);
    expect((await api().post(`${V1}/auth/refresh`).send({ refreshToken: second.tokens.refreshToken })).status).toBe(
      401,
    );
  });
});

describe('password reset', () => {
  it('always answers 202 and only emails real accounts', async () => {
    const res = await api().post(`${V1}/auth/forgot-password`).send({ email: 'ghost@example.com' });
    expect(res.status).toBe(202);
    expect(sentMail).toHaveLength(0);
  });

  it('resets the password once and revokes existing sessions', async () => {
    const { user, refreshToken, auth } = await authedUser();
    await api().post(`${V1}/auth/forgot-password`).send({ email: user.email }).expect(202);
    const token = tokenFromMail();
    expect(await UserToken.count({ where: { tokenHash: hashToken(token) } })).toBe(1);

    await api().post(`${V1}/auth/reset-password`).send({ token, password: 'NewPassword456' }).expect(200);
    expect((await api().post(`${V1}/auth/refresh`).send({ refreshToken })).status).toBe(401);
    // Access tokens issued before the reset are rejected too.
    expect((await api().get(`${V1}/users/me`).set(auth)).status).toBe(401);

    await login(user.email, 'NewPassword456');
    const reused = await api().post(`${V1}/auth/reset-password`).send({ token, password: 'Another789Pass' });
    expect(reused.status).toBe(400);
  });

  it('rejects expired tokens', async () => {
    const user = await createUser();
    await api().post(`${V1}/auth/forgot-password`).send({ email: user.email });
    const token = tokenFromMail();
    await UserToken.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { userId: user.id } });
    expect((await api().post(`${V1}/auth/reset-password`).send({ token, password: 'NewPassword456' })).status).toBe(
      400,
    );
  });
});

describe('email verification', () => {
  it('verifies via the emailed token', async () => {
    await api()
      .post(`${V1}/auth/register`)
      .send({ email: 'v@example.com', password: 'Password123', firstName: 'V', lastName: 'U' });
    const token = tokenFromMail();
    await api().post(`${V1}/auth/verify-email`).send({ token }).expect(200);
    const user = await User.findOne({ where: { email: 'v@example.com' } });
    expect(user!.emailVerifiedAt).toBeInstanceOf(Date);
    expect((await api().post(`${V1}/auth/verify-email`).send({ token })).status).toBe(400);
  });

  it('resends only for unverified accounts', async () => {
    const verified = await createUser();
    const unverified = await createUser({ verified: false });
    await api().post(`${V1}/auth/resend-verification`).send({ email: verified.email }).expect(202);
    expect(sentMail).toHaveLength(0);
    await api().post(`${V1}/auth/resend-verification`).send({ email: unverified.email }).expect(202);
    expect(sentMail).toHaveLength(1);
  });
});

describe('authentication middleware', () => {
  it('requires a bearer token', async () => {
    const none = await api().get(`${V1}/users/me`);
    expect([none.status, none.body.error.code]).toEqual([401, 'UNAUTHORIZED']);
    const bad = await api().get(`${V1}/users/me`).set('Authorization', 'Bearer not-a-jwt');
    expect(bad.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects tokens of users suspended after sign-in', async () => {
    const { user, auth } = await authedUser();
    await user.update({ status: 'suspended' });
    const res = await api().get(`${V1}/users/me`).set(auth);
    expect([res.status, res.body.error.code]).toEqual([403, 'ACCOUNT_SUSPENDED']);
  });
});
