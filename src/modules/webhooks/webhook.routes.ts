import { Router } from 'express';
import { env } from '../../config/env';
import { errors, json, registry, success } from '../../docs/registry';
import { cache } from '../../lib/cache';
import { enqueueWebhook } from '../../lib/queue';
import { ApiResponse } from '../../utils/api-response';
import { AppError, ErrorCode } from '../../utils/app-error';
import { HttpStatus } from '../../utils/http-status';
import { z } from '../../utils/zod';
import { SIGNATURE_HEADER, verifyWebhookSignature } from './webhook.signature';

const eventSchema = z
  .object({
    id: z.string().min(1).max(128).openapi({ example: 'evt_01J8Z3' }),
    type: z.string().min(1).max(128).openapi({ example: 'invoice.paid' }),
    data: z.unknown(),
  })
  .openapi('WebhookEvent');

export const webhookRouter = Router();

/**
 * Receives signed webhooks. The body arrives as a raw Buffer (see app.ts) because the
 * signature is computed over the exact bytes sent.
 */
webhookRouter.post('/:provider', async (req, res) => {
  if (!env.WEBHOOK_SECRET) {
    throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.SERVICE_UNAVAILABLE, 'Webhooks are not configured');
  }
  const provider = String(req.params.provider);
  if (!/^[a-z0-9_-]{1,32}$/.test(provider)) throw AppError.notFound('Webhook provider');

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const result = verifyWebhookSignature(
    env.WEBHOOK_SECRET,
    rawBody,
    req.get(SIGNATURE_HEADER),
    env.WEBHOOK_TOLERANCE_SECONDS,
  );
  if (!result.valid) {
    req.log.warn({ provider, reason: result.reason }, 'rejected webhook');
    throw AppError.unauthorized('Invalid webhook signature', ErrorCode.INVALID_TOKEN);
  }

  let event: z.infer<typeof eventSchema>;
  try {
    event = eventSchema.parse(JSON.parse(rawBody.toString('utf8')));
  } catch {
    throw AppError.badRequest('Invalid webhook payload');
  }

  // Providers retry deliveries; acknowledge duplicates without processing them twice.
  const firstDelivery = await cache.setIfAbsent(`webhook:${provider}:${event.id}`, true, 7 * 86_400);
  if (!firstDelivery) return ApiResponse.ok(res, { received: true, duplicate: true });

  await enqueueWebhook({
    provider,
    eventId: event.id,
    type: event.type,
    payload: event.data,
  });
  ApiResponse.ok(res, { received: true, duplicate: false }, undefined, HttpStatus.ACCEPTED);
});

registry.registerPath({
  method: 'post',
  path: '/webhooks/{provider}',
  tags: ['Webhooks'],
  summary: 'Receive a signed webhook',
  description: `Header \`${SIGNATURE_HEADER}: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>\`. Requests older than WEBHOOK_TOLERANCE_SECONDS are rejected, and duplicate event ids are acknowledged without reprocessing.`,
  request: {
    params: z.object({ provider: z.string().openapi({ example: 'billing' }) }),
    headers: z.object({
      [SIGNATURE_HEADER]: z.string().openapi({ example: 't=1760000000,v1=5f2b...' }),
    }),
    body: { content: { 'application/json': { schema: eventSchema } } },
  },
  responses: {
    202: json('Accepted', success(z.object({ received: z.boolean(), duplicate: z.boolean() }))),
    200: json('Duplicate delivery acknowledged', success(z.object({ received: z.boolean(), duplicate: z.boolean() }))),
    400: errors[400],
    401: errors[401],
  },
});
