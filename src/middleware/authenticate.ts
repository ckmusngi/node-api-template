import type { RequestHandler } from 'express';
import { passwordVersion, verifyAccessToken } from '../modules/auth/token.service';
import { User } from '../models';
import { AppError, ErrorCode } from '../utils/app-error';
import { requestContext } from '../utils/request-context';

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * Verifies the JWT, then re-loads the user so suspended/deleted accounts and
 * tokens issued before a password change are rejected immediately.
 */
async function resolveUser(token: string): Promise<Express.AuthUser> {
  const payload = verifyAccessToken(token);
  const user = await User.findByPk(payload.sub);
  if (!user) throw AppError.unauthorized('Invalid access token', ErrorCode.INVALID_TOKEN);
  if (user.status === 'suspended') throw AppError.forbidden('Account is suspended', ErrorCode.ACCOUNT_SUSPENDED);
  if (user.status === 'inactive') throw AppError.forbidden('Account is inactive', ErrorCode.ACCOUNT_INACTIVE);
  if ((payload.pv ?? 0) !== passwordVersion(user.passwordChangedAt)) {
    throw AppError.unauthorized('Session is no longer valid, please sign in again', ErrorCode.INVALID_TOKEN);
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  };
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = extractBearer(req.get('authorization'));
  if (!token) return next(AppError.unauthorized());
  req.user = await resolveUser(token);
  req.tenantId = req.user.tenantId;
  requestContext.set({ userId: req.user.id, tenantId: req.user.tenantId });
  next();
};

/** Attaches the user when a valid token is present but does not require one. */
export const optionalAuthenticate: RequestHandler = async (req, _res, next) => {
  const token = extractBearer(req.get('authorization'));
  if (token) {
    req.user = await resolveUser(token);
    req.tenantId = req.user.tenantId;
    requestContext.set({ userId: req.user.id, tenantId: req.user.tenantId });
  }
  next();
};
