import type { RequestHandler } from 'express';
import { hasPermission, type Permission, type Role } from '../config/rbac';
import { AppError } from '../utils/app-error';

/** Requires the authenticated user to hold every listed permission. */
export function authorize(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    const missing = permissions.filter((p) => !hasPermission(req.user!.role, p));
    if (missing.length) return next(AppError.forbidden());
    next();
  };
}

/** Requires one of the listed roles. Prefer `authorize` with permissions for new routes. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
}

/** Resource-level check: the user owns the resource or holds the "any" permission. */
export function canAccess(user: Express.AuthUser, ownerId: string, anyPermission: Permission): boolean {
  return user.id === ownerId || hasPermission(user.role, anyPermission);
}
