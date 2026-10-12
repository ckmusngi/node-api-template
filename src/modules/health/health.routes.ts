import { Router } from 'express';
import { checkDatabase } from '../../config/database';
import { env } from '../../config/env';
import { json, registry } from '../../docs/registry';
import { lifecycle } from '../../lib/lifecycle';
import { checkRedis } from '../../lib/redis';
import { HttpStatus } from '../../utils/http-status';
import { z } from '../../utils/zod';

export const healthRouter = Router();

/** Liveness: the process is up and serving requests. Never touches dependencies. */
healthRouter.get('/health', (_req, res) => {
  res.status(HttpStatus.OK).json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/** Readiness: dependencies are reachable and the instance is not draining. */
healthRouter.get('/ready', async (_req, res) => {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const checks = { database, ...(redis ? { redis } : {}) };
  const ready = !lifecycle.isShuttingDown() && Object.values(checks).every((c) => c.ok);
  // Error details are internal; only expose them outside production.
  const visible =
    env.NODE_ENV === 'production'
      ? Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, { ok: v.ok, latencyMs: v.latencyMs }]))
      : checks;
  res.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
    status: ready ? 'ready' : lifecycle.isShuttingDown() ? 'shutting_down' : 'unavailable',
    checks: visible,
    timestamp: new Date().toISOString(),
  });
});

const check = z.object({
  ok: z.boolean(),
  latencyMs: z.number(),
  error: z.string().optional(),
});
registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Liveness probe',
  description: 'Served at the server root (not under /api/v1).',
  servers: [{ url: '/' }],
  responses: {
    200: json(
      'Alive',
      z.object({
        status: z.literal('ok'),
        uptime: z.number(),
        timestamp: z.string(),
      }),
    ),
  },
});
registry.registerPath({
  method: 'get',
  path: '/ready',
  tags: ['Health'],
  summary: 'Readiness probe (database, Redis)',
  servers: [{ url: '/' }],
  responses: {
    200: json(
      'Ready',
      z.object({
        status: z.string(),
        checks: z.record(z.string(), check),
        timestamp: z.string(),
      }),
    ),
    503: {
      description: 'A dependency is unavailable or the instance is shutting down',
    },
  },
});
