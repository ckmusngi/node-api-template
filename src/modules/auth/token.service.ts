import { randomUUID } from 'node:crypto';
import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import type { Transaction } from 'sequelize';
import { env } from '../../config/env';
import type { Role } from '../../config/rbac';
import { RefreshToken } from '../../models';
import { AppError, ErrorCode } from '../../utils/app-error';
import { generateToken, hashToken } from '../../utils/crypto';
import { addDuration, parseDuration } from '../../utils/date';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  tid: string | null;
  /** Password version: invalidates every token issued before the latest password change. */
  pv: number;
  iat: number;
  exp: number;
  jti: string;
}

export interface ClientMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export const accessTokenTtlSeconds = Math.floor(parseDuration(env.JWT_ACCESS_TTL) / 1000);

export function passwordVersion(passwordChangedAt: Date | null | undefined): number {
  return passwordChangedAt ? passwordChangedAt.getTime() : 0;
}

export function signAccessToken(user: {
  id: string;
  role: Role;
  tenantId: string | null;
  passwordChangedAt?: Date | null;
}): string {
  return jwt.sign(
    { role: user.role, tid: user.tenantId, pv: passwordVersion(user.passwordChangedAt) },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      subject: user.id,
      expiresIn: accessTokenTtlSeconds,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      jwtid: randomUUID(),
    },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }) as AccessTokenPayload;
  } catch (err) {
    if (err instanceof TokenExpiredError) throw AppError.unauthorized('Access token expired', ErrorCode.TOKEN_EXPIRED);
    if (err instanceof JsonWebTokenError) throw AppError.unauthorized('Invalid access token', ErrorCode.INVALID_TOKEN);
    throw err;
  }
}

/** Creates a refresh token. Pass `familyId` when rotating so the chain can be revoked together. */
export async function issueRefreshToken(
  userId: string,
  meta: ClientMeta,
  options: { familyId?: string; transaction?: Transaction } = {},
): Promise<{ token: string; record: RefreshToken }> {
  const token = generateToken();
  const record = await RefreshToken.create(
    {
      userId,
      tokenHash: hashToken(token),
      familyId: options.familyId ?? randomUUID(),
      expiresAt: addDuration(new Date(), env.REFRESH_TOKEN_TTL),
      revokedAt: null,
      revokedReason: null,
      replacedById: null,
      createdByIp: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
    { transaction: options.transaction },
  );
  return { token, record };
}
