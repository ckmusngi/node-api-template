import request from 'supertest';
import { createApp } from '../../src/app';
import type { Role } from '../../src/config/rbac';
import { Note, User } from '../../src/models';
import type { UserStatus } from '../../src/models/user.model';
import { hashPassword } from '../../src/utils/password';

export const app = createApp();
export const api = () => request(app);
export const V1 = '/api/v1';
export const DEFAULT_PASSWORD = 'Password123!';

let counter = 0;

export async function createUser(
  overrides: Partial<{
    email: string;
    role: Role;
    status: UserStatus;
    password: string;
    verified: boolean;
    tenantId: string | null;
  }> = {},
) {
  counter += 1;
  return User.create({
    email: overrides.email ?? `user${counter}-${Date.now()}@example.com`,
    passwordHash: await hashPassword(overrides.password ?? DEFAULT_PASSWORD),
    firstName: 'Test',
    lastName: `User${counter}`,
    role: overrides.role ?? 'user',
    status: overrides.status ?? 'active',
    emailVerifiedAt: overrides.verified === false ? null : new Date(),
    tenantId: overrides.tenantId ?? null,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: null,
    deletedAt: null,
  });
}

export async function login(email: string, password = DEFAULT_PASSWORD) {
  const res = await api().post(`${V1}/auth/login`).send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { user: { id: string }; tokens: { accessToken: string; refreshToken: string } };
}

/** Creates a user and returns it with a valid access token. */
export async function authedUser(overrides: Parameters<typeof createUser>[0] = {}) {
  const user = await createUser(overrides);
  const { tokens } = await login(user.email, overrides.password);
  return {
    user,
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    auth: { Authorization: `Bearer ${tokens.accessToken}` },
  };
}

export function createNote(
  userId: string,
  overrides: Partial<{ title: string; content: string; status: 'draft' | 'published' | 'archived' }> = {},
) {
  return Note.create({
    userId,
    tenantId: null,
    title: overrides.title ?? 'A note',
    content: overrides.content ?? 'Body',
    status: overrides.status ?? 'draft',
  });
}
