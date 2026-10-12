import { AuditLog, RefreshToken, User } from '../../src/models';
import { V1, api, authedUser, createUser } from '../helpers/factories';

describe('current user profile', () => {
  it('returns the profile without sensitive fields', async () => {
    const { user, auth } = await authedUser();
    const res = await api().get(`${V1}/users/me`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: user.id, email: user.email });
    for (const field of ['passwordHash', 'failedLoginAttempts', 'lockedUntil', 'deletedAt']) {
      expect(res.body.data).not.toHaveProperty(field);
    }
  });

  it('updates allowed fields only and refreshes the cache', async () => {
    const { auth } = await authedUser();
    await api().get(`${V1}/users/me`).set(auth); // warm cache
    const res = await api().patch(`${V1}/users/me`).set(auth).send({ firstName: 'Renamed' });
    expect(res.body.data.firstName).toBe('Renamed');
    expect((await api().get(`${V1}/users/me`).set(auth)).body.data.firstName).toBe('Renamed');

    const escalate = await api().patch(`${V1}/users/me`).set(auth).send({ role: 'admin' });
    expect(escalate.status).toBe(422);
  });

  it('changes the password, revokes old sessions and returns new tokens', async () => {
    const { auth, refreshToken } = await authedUser();
    const wrong = await api()
      .post(`${V1}/users/me/change-password`)
      .set(auth)
      .send({ currentPassword: 'nope', newPassword: 'NewPassword456' });
    expect(wrong.status).toBe(401);

    const res = await api()
      .post(`${V1}/users/me/change-password`)
      .set(auth)
      .send({ currentPassword: 'Password123!', newPassword: 'NewPassword456' });
    expect(res.status).toBe(200);
    expect((await api().get(`${V1}/users/me`).set(auth)).status).toBe(401);
    expect((await api().post(`${V1}/auth/refresh`).send({ refreshToken })).status).toBe(401);
    const fresh = { Authorization: `Bearer ${res.body.data.tokens.accessToken}` };
    expect((await api().get(`${V1}/users/me`).set(fresh)).status).toBe(200);
  });

  it('soft deletes the account', async () => {
    const { user, auth } = await authedUser();
    await api().delete(`${V1}/users/me`).set(auth).expect(204);
    expect(await User.findByPk(user.id)).toBeNull();
    expect(await User.findByPk(user.id, { paranoid: false })).not.toBeNull();
    expect((await api().get(`${V1}/users/me`).set(auth)).status).toBe(401);
  });
});

describe('user administration (RBAC)', () => {
  it('forbids regular users', async () => {
    const { auth } = await authedUser();
    const res = await api().get(`${V1}/users`).set(auth);
    expect([res.status, res.body.error.code]).toEqual([403, 'FORBIDDEN']);
  });

  it('lists with pagination, filtering, search and sorting', async () => {
    const { auth } = await authedUser({ role: 'admin', email: 'admin@example.com' });
    await createUser({ email: 'alice@example.com' });
    await createUser({ email: 'bob@example.com', status: 'suspended' });
    await createUser({ email: 'carol@example.com' });

    const page = await api().get(`${V1}/users?limit=2&page=1&sort=email`).set(auth);
    expect(page.body.data.map((u: { email: string }) => u.email)).toEqual(['admin@example.com', 'alice@example.com']);
    expect(page.body.meta.pagination).toMatchObject({ total: 4, totalPages: 2, hasNextPage: true });

    const suspended = await api().get(`${V1}/users?status=suspended`).set(auth);
    expect(suspended.body.data.map((u: { email: string }) => u.email)).toEqual(['bob@example.com']);

    const search = await api().get(`${V1}/users?search=CAROL`).set(auth);
    expect(search.body.data).toHaveLength(1);

    // LIKE wildcards in search are matched literally.
    expect((await api().get(`${V1}/users?search=%25`).set(auth)).body.data).toHaveLength(0);
    expect((await api().get(`${V1}/users?sort=passwordHash`).set(auth)).status).toBe(422);
  });

  it('suspends a user, revoking their sessions, and records an audit entry', async () => {
    const admin = await authedUser({ role: 'admin' });
    const target = await authedUser();
    const res = await api()
      .patch(`${V1}/users/${target.user.id}/status`)
      .set(admin.auth)
      .send({ status: 'suspended', reason: 'abuse' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('suspended');
    expect(await RefreshToken.count({ where: { userId: target.user.id, revokedAt: null } })).toBe(0);
    expect((await api().get(`${V1}/users/me`).set(target.auth)).status).toBe(403);

    const audit = await AuditLog.findOne({ where: { action: 'user.status_changed' } });
    expect(audit).toMatchObject({
      actorId: admin.user.id,
      entityId: target.user.id,
      metadata: { from: 'active', to: 'suspended', reason: 'abuse' },
    });
  });

  it('changes roles, prevents self-demotion and restores deleted users', async () => {
    const admin = await authedUser({ role: 'admin' });
    const target = await createUser();
    await api().patch(`${V1}/users/${target.id}/role`).set(admin.auth).send({ role: 'admin' }).expect(200);
    expect((await api().patch(`${V1}/users/${admin.user.id}/role`).set(admin.auth).send({ role: 'user' })).status).toBe(
      403,
    );

    await api().delete(`${V1}/users/${target.id}`).set(admin.auth).expect(204);
    expect((await api().get(`${V1}/users/${target.id}`).set(admin.auth)).status).toBe(404);
    await api().post(`${V1}/users/${target.id}/restore`).set(admin.auth).expect(200);
    expect((await api().get(`${V1}/users/${target.id}`).set(admin.auth)).status).toBe(200);
  });

  it('validates ids', async () => {
    const admin = await authedUser({ role: 'admin' });
    expect((await api().get(`${V1}/users/not-a-uuid`).set(admin.auth)).status).toBe(422);
  });
});

describe('audit logs', () => {
  it('lets admins page and filter audit entries', async () => {
    const admin = await authedUser({ role: 'admin' });
    const user = await authedUser();
    const res = await api().get(`${V1}/audit-logs?action=auth.login&actorId=${user.user.id}`).set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ action: 'auth.login', actorId: user.user.id });
    expect(res.body.data[0].requestId).toEqual(expect.any(String));
    expect((await api().get(`${V1}/audit-logs`).set(user.auth)).status).toBe(403);
  });
});
