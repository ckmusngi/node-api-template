import type { Request } from 'express';
import type { Transaction, WhereOptions } from 'sequelize';
import { logger } from '../../config/logger';
import { AuditLog } from '../../models';
import { buildPaginationMeta, toOffset, type PaginationInput } from '../../utils/pagination';
import { buildFilters } from '../../utils/query';
import { requestContext } from '../../utils/request-context';

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  tenantId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** Extracts request details for an audit entry. */
export function auditContext(req: Request) {
  return {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
    requestId: req.res?.locals.requestId as string | undefined,
  };
}

/**
 * Records an audit entry. Failures are logged rather than thrown so auditing never
 * breaks the primary operation — unless a transaction is passed, in which case the
 * entry commits or rolls back with it.
 */
export async function recordAudit(
  entry: AuditEntry,
  ctx: {
    ip?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
  } = {},
  transaction?: Transaction,
): Promise<void> {
  const store = requestContext.get();
  const values = {
    action: entry.action,
    actorId: entry.actorId ?? store?.userId ?? null,
    tenantId: entry.tenantId ?? store?.tenantId ?? null,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
    requestId: ctx.requestId ?? store?.requestId ?? null,
  };
  if (transaction) {
    await AuditLog.create(values, { transaction });
    return;
  }
  try {
    await AuditLog.create(values);
  } catch (err) {
    logger.error({ err, action: entry.action }, 'failed to write audit log');
  }
}

export interface AuditListQuery extends PaginationInput {
  action?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
}

export async function listAuditLogs(query: AuditListQuery, scope: WhereOptions = {}) {
  const where = {
    ...buildFilters(
      {
        action: query.action,
        actorId: query.actorId,
        entityType: query.entityType,
        entityId: query.entityId,
        from: query.from,
        to: query.to,
      },
      {
        action: { op: 'eq' },
        actorId: { op: 'eq' },
        entityType: { op: 'eq' },
        entityId: { op: 'eq' },
        from: { op: 'gte', column: 'createdAt' },
        to: { op: 'lte', column: 'createdAt' },
      },
    ),
    ...scope,
  };
  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    ...toOffset(query),
  });
  return { rows, meta: buildPaginationMeta(count, query) };
}
