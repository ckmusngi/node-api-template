import { Router } from 'express';
import { errors, json, paginated, registry, secured } from '../../docs/registry';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantScope } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { ApiResponse } from '../../utils/api-response';
import { paginationQuery, schemas } from '../../utils/validation';
import { z } from '../../utils/zod';
import { listAuditLogs, type AuditListQuery } from './audit.service';

const listAuditQuery = paginationQuery.extend({
  action: z.string().max(100).optional().openapi({ example: 'auth.login' }),
  actorId: schemas.uuid.optional(),
  entityType: z.string().max(64).optional(),
  entityId: z.string().max(128).optional(),
  from: schemas.isoDate.optional(),
  to: schemas.isoDate.optional(),
});

const AuditLogSchema = z
  .object({
    id: z.number().int(),
    tenantId: z.string().nullable(),
    actorId: z.string().nullable(),
    action: z.string().openapi({ example: 'user.status_changed' }),
    entityType: z.string().nullable(),
    entityId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    requestId: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi('AuditLog');

export const auditRouter = Router();

auditRouter.get('/', authenticate, authorize('audit:read'), validate({ query: listAuditQuery }), async (req, res) => {
  const { rows, meta } = await listAuditLogs(req.validated.query as AuditListQuery, tenantScope(req.user));
  ApiResponse.paginated(res, rows, meta);
});

registry.registerPath({
  method: 'get',
  path: '/audit-logs',
  tags: ['Audit'],
  security: secured,
  summary: 'List audit log entries (newest first)',
  request: { query: listAuditQuery },
  responses: {
    200: json('Audit entries', paginated(AuditLogSchema)),
    401: errors[401],
    403: errors[403],
  },
});
