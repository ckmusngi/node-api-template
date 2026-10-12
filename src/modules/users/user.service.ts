import { Op, type WhereOptions } from 'sequelize';
import { env } from '../../config/env';
import { cache, cacheKeys } from '../../lib/cache';
import { sequelize, User } from '../../models';
import { AppError, ErrorCode } from '../../utils/app-error';
import { createCrudRepository } from '../../utils/crud';
import { nowToSecond } from '../../utils/date';
import { hashPassword, verifyPassword } from '../../utils/password';
import { recordAudit } from '../audit/audit.service';
import { createTokens, revokeAllRefreshTokens, type RequestMeta } from '../auth/auth.service';
import {
  USER_SORTABLE,
  type ListUsersQuery,
  type UpdateProfileBody,
  type UpdateRoleBody,
  type UpdateStatusBody,
} from './user.schemas';

export const userRepository = createCrudRepository({
  model: User,
  name: 'User',
  sortable: USER_SORTABLE,
  searchable: ['email', 'firstName', 'lastName'],
  filters: { role: { op: 'eq' }, status: { op: 'eq' } },
});

async function invalidate(userId: string) {
  await cache.del(cacheKeys.userProfile(userId));
}

/** Profile reads are cached (Redis when enabled) and invalidated on every write. */
export async function getProfile(userId: string) {
  return cache.wrap(cacheKeys.userProfile(userId), env.CACHE_TTL_SECONDS, async () => {
    const user = await User.findByPk(userId);
    if (!user) throw AppError.notFound('User');
    return user.toJSON();
  });
}

export async function updateProfile(userId: string, input: UpdateProfileBody, meta: RequestMeta) {
  const user = await userRepository.findById(userId);
  await user.update(input);
  await invalidate(userId);
  await recordAudit(
    {
      action: 'user.profile_updated',
      actorId: userId,
      entityType: 'user',
      entityId: userId,
      metadata: { fields: Object.keys(input) },
    },
    meta,
  );
  return user;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, meta: RequestMeta) {
  const user = await User.scope('withPassword').findByPk(userId);
  if (!user) throw AppError.notFound('User');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw AppError.unauthorized('Current password is incorrect', ErrorCode.INVALID_CREDENTIALS);
  }
  const tokens = await sequelize.transaction(async (transaction) => {
    await user.update(
      {
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: nowToSecond(),
      },
      { transaction },
    );
    await revokeAllRefreshTokens(userId, 'password_changed', transaction);
    await recordAudit(
      {
        action: 'user.password_changed',
        actorId: userId,
        entityType: 'user',
        entityId: userId,
      },
      meta,
      transaction,
    );
    // Every earlier token is now invalid, so hand the caller a fresh session.
    return (await createTokens(user, meta, undefined, transaction)).tokens;
  });
  await invalidate(userId);
  return tokens;
}

export async function deleteOwnAccount(userId: string, meta: RequestMeta) {
  await sequelize.transaction(async (transaction) => {
    const user = await userRepository.findById(userId, {}, { transaction });
    await revokeAllRefreshTokens(userId, 'account_deleted', transaction);
    await user.destroy({ transaction });
    await recordAudit(
      {
        action: 'user.account_deleted',
        actorId: userId,
        entityType: 'user',
        entityId: userId,
      },
      meta,
      transaction,
    );
  });
  await invalidate(userId);
}

// ---- Admin operations ----

export function listUsers(query: ListUsersQuery, scope: WhereOptions) {
  return userRepository.list(query, scope, { paranoid: !query.includeDeleted });
}

export function getUser(id: string, scope: WhereOptions) {
  return userRepository.findById(id, scope);
}

function assertNotSelf(actor: Express.AuthUser, targetId: string, action: string) {
  if (actor.id === targetId) throw AppError.forbidden(`You cannot ${action} your own account`);
}

export async function updateStatus(
  actor: Express.AuthUser,
  id: string,
  input: UpdateStatusBody,
  scope: WhereOptions,
  meta: RequestMeta,
) {
  assertNotSelf(actor, id, 'change the status of');
  const user = await userRepository.findById(id, scope);
  const previous = user.status;
  await sequelize.transaction(async (transaction) => {
    await user.update({ status: input.status }, { transaction });
    // Deactivated or suspended users lose their sessions immediately.
    if (input.status !== 'active') await revokeAllRefreshTokens(id, `status_${input.status}`, transaction);
    await recordAudit(
      {
        action: 'user.status_changed',
        actorId: actor.id,
        entityType: 'user',
        entityId: id,
        metadata: { from: previous, to: input.status, reason: input.reason },
      },
      meta,
      transaction,
    );
  });
  await invalidate(id);
  return user;
}

export async function updateRole(
  actor: Express.AuthUser,
  id: string,
  input: UpdateRoleBody,
  scope: WhereOptions,
  meta: RequestMeta,
) {
  assertNotSelf(actor, id, 'change the role of');
  const user = await userRepository.findById(id, scope);
  const previous = user.role;
  await user.update({ role: input.role });
  await recordAudit(
    {
      action: 'user.role_changed',
      actorId: actor.id,
      entityType: 'user',
      entityId: id,
      metadata: { from: previous, to: input.role },
    },
    meta,
  );
  await invalidate(id);
  return user;
}

export async function deleteUser(actor: Express.AuthUser, id: string, scope: WhereOptions, meta: RequestMeta) {
  assertNotSelf(actor, id, 'delete');
  await sequelize.transaction(async (transaction) => {
    const user = await userRepository.findById(id, scope, { transaction });
    await revokeAllRefreshTokens(id, 'account_deleted', transaction);
    await user.destroy({ transaction });
    await recordAudit(
      {
        action: 'user.deleted',
        actorId: actor.id,
        entityType: 'user',
        entityId: id,
      },
      meta,
      transaction,
    );
  });
  await invalidate(id);
}

export async function restoreUser(actor: Express.AuthUser, id: string, scope: WhereOptions, meta: RequestMeta) {
  const user = await userRepository.restore(id, {
    ...scope,
    deletedAt: { [Op.ne]: null },
  });
  await recordAudit(
    {
      action: 'user.restored',
      actorId: actor.id,
      entityType: 'user',
      entityId: id,
    },
    meta,
  );
  return user;
}
