import { Op, type Transaction } from 'sequelize';
import { env } from '../../config/env';
import { cache, cacheKeys } from '../../lib/cache';
import { passwordResetEmail, verificationEmail } from '../../lib/email-templates';
import { authEvents } from '../../lib/metrics';
import { enqueueEmail } from '../../lib/queue';
import { RefreshToken, sequelize, User, UserToken } from '../../models';
import type { UserTokenType } from '../../models/user-token.model';
import { AppError, ErrorCode } from '../../utils/app-error';
import { generateToken, hashToken } from '../../utils/crypto';
import { addDuration, isExpired, nowToSecond } from '../../utils/date';
import { HttpStatus } from '../../utils/http-status';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../utils/password';
import { recordAudit } from '../audit/audit.service';
import type { LoginBody, RegisterBody } from './auth.schemas';
import { accessTokenTtlSeconds, issueRefreshToken, signAccessToken, type ClientMeta } from './token.service';

export interface RequestMeta extends ClientMeta {
  requestId?: string;
}

export interface AuthTokens {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/** Issues a new access/refresh token pair (a new session family unless one is given). */
export async function createTokens(user: User, meta: ClientMeta, familyId?: string, transaction?: Transaction) {
  const { token, record } = await issueRefreshToken(user.id, meta, {
    familyId,
    transaction,
  });
  const tokens: AuthTokens = {
    tokenType: 'Bearer',
    accessToken: signAccessToken(user),
    expiresIn: accessTokenTtlSeconds,
    refreshToken: token,
    refreshTokenExpiresAt: record.expiresAt,
  };
  return { tokens, record };
}

async function createUserToken(userId: string, type: UserTokenType, ttl: string, transaction?: Transaction) {
  // Only the newest token of each type is valid.
  await UserToken.update({ usedAt: new Date() }, { where: { userId, type, usedAt: null }, transaction });
  const token = generateToken(32);
  await UserToken.create(
    {
      userId,
      type,
      tokenHash: hashToken(token),
      expiresAt: addDuration(new Date(), ttl),
      usedAt: null,
    },
    { transaction },
  );
  return token;
}

async function consumeUserToken(token: string, type: UserTokenType, transaction: Transaction) {
  const record = await UserToken.findOne({
    where: { tokenHash: hashToken(token), type },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!record || record.usedAt || isExpired(record.expiresAt)) {
    throw AppError.badRequest('Token is invalid or has expired');
  }
  await record.update({ usedAt: new Date() }, { transaction });
  return record;
}

export async function revokeAllRefreshTokens(userId: string, reason: string, transaction?: Transaction) {
  await RefreshToken.update(
    { revokedAt: new Date(), revokedReason: reason },
    { where: { userId, revokedAt: null }, transaction },
  );
}

export async function sendVerificationEmail(user: User) {
  const token = await createUserToken(user.id, 'email_verification', env.EMAIL_VERIFICATION_TTL);
  await enqueueEmail({
    to: user.email,
    ...verificationEmail(user.firstName, token),
  });
}

export async function register(input: RegisterBody, tenantId: string | null, meta: RequestMeta) {
  const user = await sequelize.transaction(async (transaction) => {
    const existing = await User.findOne({
      where: { email: input.email },
      paranoid: false,
      transaction,
    });
    if (existing) throw AppError.conflict('An account with this email already exists');

    const created = await User.create(
      {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
        tenantId,
        emailVerifiedAt: null,
        lockedUntil: null,
        lastLoginAt: null,
        passwordChangedAt: null,
        deletedAt: null,
      },
      { transaction },
    );
    await recordAudit(
      {
        action: 'auth.register',
        actorId: created.id,
        tenantId,
        entityType: 'user',
        entityId: created.id,
      },
      meta,
      transaction,
    );
    return created;
  });

  await sendVerificationEmail(user);
  authEvents.add(1, { event: 'register' });
  return (await User.findByPk(user.id))!;
}

export async function login(input: LoginBody, meta: RequestMeta) {
  const user = await User.scope('withPassword').findOne({
    where: { email: input.email },
  });

  if (!user) {
    await burnPasswordCheck(input.password);
    authEvents.add(1, { event: 'login', outcome: 'unknown_user' });
    throw AppError.unauthorized('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
  }

  if (user.lockedUntil && !isExpired(user.lockedUntil)) {
    authEvents.add(1, { event: 'login', outcome: 'locked' });
    throw new AppError(HttpStatus.LOCKED, ErrorCode.ACCOUNT_LOCKED, 'Too many failed attempts. Try again later.');
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= env.LOGIN_MAX_ATTEMPTS;
    await user.update({
      failedLoginAttempts: lock ? 0 : attempts,
      lockedUntil: lock ? addDuration(new Date(), env.LOGIN_LOCKOUT_MS) : user.lockedUntil,
    });
    await recordAudit(
      {
        action: lock ? 'auth.account_locked' : 'auth.login_failed',
        actorId: user.id,
        entityType: 'user',
        entityId: user.id,
      },
      meta,
    );
    authEvents.add(1, { event: 'login', outcome: 'bad_password' });
    throw AppError.unauthorized('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
  }

  // Status is checked only after the password so it does not leak account state.
  if (user.status === 'suspended') throw AppError.forbidden('Account is suspended', ErrorCode.ACCOUNT_SUSPENDED);
  if (user.status === 'inactive') throw AppError.forbidden('Account is inactive', ErrorCode.ACCOUNT_INACTIVE);
  if (env.REQUIRE_EMAIL_VERIFICATION && !user.emailVerifiedAt) {
    throw AppError.forbidden('Please verify your email address before signing in', ErrorCode.EMAIL_NOT_VERIFIED);
  }

  await user.update({
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: new Date(),
  });
  const { tokens } = await createTokens(user, meta);
  await recordAudit(
    {
      action: 'auth.login',
      actorId: user.id,
      tenantId: user.tenantId,
      entityType: 'user',
      entityId: user.id,
    },
    meta,
  );
  authEvents.add(1, { event: 'login', outcome: 'success' });
  return { user: (await User.findByPk(user.id))!, tokens };
}

/**
 * Rotates a refresh token: the presented token is revoked and replaced by a new one in
 * the same family. Presenting an already-revoked token means it was stolen or replayed,
 * so the entire family is revoked and the user must sign in again.
 */
export async function refresh(rawToken: string, meta: RequestMeta) {
  const outcome = await sequelize.transaction(async (transaction) => {
    const current = await RefreshToken.findOne({
      where: { tokenHash: hashToken(rawToken) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!current) throw AppError.unauthorized('Invalid refresh token', ErrorCode.INVALID_TOKEN);

    if (current.revokedAt) {
      await RefreshToken.update(
        { revokedAt: new Date(), revokedReason: 'reuse_detected' },
        { where: { familyId: current.familyId, revokedAt: null }, transaction },
      );
      return { reuse: true as const, userId: current.userId };
    }
    if (isExpired(current.expiresAt)) throw AppError.unauthorized('Refresh token expired', ErrorCode.TOKEN_EXPIRED);

    const user = await User.findByPk(current.userId, { transaction });
    if (!user) throw AppError.unauthorized('Invalid refresh token', ErrorCode.INVALID_TOKEN);
    if (user.status !== 'active') {
      throw AppError.forbidden(
        `Account is ${user.status}`,
        user.status === 'suspended' ? ErrorCode.ACCOUNT_SUSPENDED : ErrorCode.ACCOUNT_INACTIVE,
      );
    }

    const { tokens, record } = await createTokens(user, meta, current.familyId, transaction);
    await current.update(
      {
        revokedAt: new Date(),
        revokedReason: 'rotated',
        replacedById: record.id,
      },
      { transaction },
    );
    return { reuse: false as const, user, tokens };
  });

  if (outcome.reuse) {
    // Recorded outside the transaction above, which has already committed the family revocation.
    await recordAudit(
      {
        action: 'auth.refresh_token_reuse',
        actorId: outcome.userId,
        entityType: 'user',
        entityId: outcome.userId,
      },
      meta,
    );
    authEvents.add(1, { event: 'refresh', outcome: 'reuse_detected' });
    throw AppError.unauthorized('Refresh token has been revoked', ErrorCode.INVALID_TOKEN);
  }
  authEvents.add(1, { event: 'refresh', outcome: 'success' });
  return { user: outcome.user, tokens: outcome.tokens };
}

/** Revokes one refresh token. Always succeeds so logout is idempotent. */
export async function logout(rawToken: string | undefined, userId: string | undefined, meta: RequestMeta) {
  if (rawToken) {
    await RefreshToken.update(
      { revokedAt: new Date(), revokedReason: 'logout' },
      {
        where: {
          tokenHash: hashToken(rawToken),
          revokedAt: null,
          ...(userId ? { userId } : {}),
        },
      },
    );
  }
  if (userId)
    await recordAudit(
      {
        action: 'auth.logout',
        actorId: userId,
        entityType: 'user',
        entityId: userId,
      },
      meta,
    );
}

export async function logoutAll(userId: string, meta: RequestMeta) {
  await revokeAllRefreshTokens(userId, 'logout_all');
  await recordAudit(
    {
      action: 'auth.logout_all',
      actorId: userId,
      entityType: 'user',
      entityId: userId,
    },
    meta,
  );
}

/** Always resolves the same way so the endpoint cannot be used to discover accounts. */
export async function forgotPassword(email: string, meta: RequestMeta) {
  const user = await User.findOne({ where: { email, status: 'active' } });
  if (!user) return;
  const token = await createUserToken(user.id, 'password_reset', env.PASSWORD_RESET_TTL);
  await enqueueEmail({
    to: user.email,
    ...passwordResetEmail(user.firstName, token),
  });
  await recordAudit(
    {
      action: 'auth.password_reset_requested',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
    },
    meta,
  );
}

export async function resetPassword(token: string, password: string, meta: RequestMeta) {
  const userId = await sequelize.transaction(async (transaction) => {
    const record = await consumeUserToken(token, 'password_reset', transaction);
    const user = await User.findByPk(record.userId, { transaction });
    if (!user) throw AppError.badRequest('Token is invalid or has expired');
    await user.update(
      {
        passwordHash: await hashPassword(password),
        passwordChangedAt: nowToSecond(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      { transaction },
    );
    await revokeAllRefreshTokens(user.id, 'password_reset', transaction);
    await recordAudit(
      {
        action: 'auth.password_reset',
        actorId: user.id,
        entityType: 'user',
        entityId: user.id,
      },
      meta,
      transaction,
    );
    return user.id;
  });
  await cache.del(cacheKeys.userProfile(userId));
}

export async function verifyEmail(token: string, meta: RequestMeta) {
  const userId = await sequelize.transaction(async (transaction) => {
    const record = await consumeUserToken(token, 'email_verification', transaction);
    await User.update(
      { emailVerifiedAt: new Date() },
      { where: { id: record.userId, emailVerifiedAt: null }, transaction },
    );
    await recordAudit(
      {
        action: 'auth.email_verified',
        actorId: record.userId,
        entityType: 'user',
        entityId: record.userId,
      },
      meta,
      transaction,
    );
    return record.userId;
  });
  await cache.del(cacheKeys.userProfile(userId));
}

export async function resendVerification(email: string) {
  const user = await User.findOne({
    where: { email, emailVerifiedAt: null, status: { [Op.ne]: 'suspended' } },
  });
  if (user) await sendVerificationEmail(user);
}
