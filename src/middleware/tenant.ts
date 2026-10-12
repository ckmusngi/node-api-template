import type { RequestHandler } from 'express';
import type { WhereOptions } from 'sequelize';
import { env } from '../config/env';
import { Tenant } from '../models';
import { AppError } from '../utils/app-error';

export const TENANT_HEADER = 'X-Tenant-Slug';

/**
 * Resolves the tenant for unauthenticated requests (e.g. registration) from the
 * X-Tenant-Slug header. Authenticated requests always use the tenant on the user
 * record, so a client cannot switch tenants by sending a header.
 */
export const resolveTenant: RequestHandler = async (req, _res, next) => {
  if (!env.MULTI_TENANCY_ENABLED || req.user) return next();
  const slug = req.get(TENANT_HEADER);
  if (!slug) {
    req.tenantId = null;
    return next();
  }
  const tenant = await Tenant.findOne({ where: { slug } });
  if (!tenant || tenant.status !== 'active') return next(AppError.badRequest('Unknown or inactive tenant'));
  req.tenantId = tenant.id;
  next();
};

/**
 * Where-clause restricting queries to the caller's tenant. Users without a tenant
 * (platform-level accounts) are not restricted. No-op when multi-tenancy is disabled.
 */
export function tenantScope(user: Express.AuthUser | undefined): WhereOptions {
  if (!env.MULTI_TENANCY_ENABLED || !user?.tenantId) return {};
  return { tenantId: user.tenantId };
}
