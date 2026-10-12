import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { env } from '../../src/config/env';
import { errorHandler } from '../../src/middleware/error-handler';
import { idempotency } from '../../src/middleware/idempotency';
import { createRateLimiter } from '../../src/middleware/rate-limit';
import { signWebhook } from '../../src/modules/webhooks/webhook.signature';
import { AuditLog } from '../../src/models';
import { V1, api, authedUser } from '../helpers/factories';

describe('health checks', () => {
  it('reports liveness and readiness', async () => {
    const live = await api().get('/health');
    expect(live.status).toBe(200);
    expect(live.body.status).toBe('ok');
    const ready = await api().get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.checks.database.ok).toBe(true);
  });
});

describe('request ids and response format', () => {
  it('generates or propagates X-Request-ID', async () => {
    const generated = await api().get(`${V1}/nope`);
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(generated.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route GET /api/v1/nope not found' },
      requestId: generated.headers['x-request-id'],
    });
    const propagated = await api().get('/health').set('X-Request-ID', 'trace-abc-123');
    expect(propagated.headers['x-request-id']).toBe('trace-abc-123');
    const unsafe = await api().get('/health').set('X-Request-ID', '<script>');
    expect(unsafe.headers['x-request-id']).not.toBe('<script>');
  });

  it('sets the API version header', async () => {
    const res = await api().get(`${V1}/users/me`);
    expect(res.headers['api-version']).toBe('v1');
  });
});

describe('security middleware', () => {
  it('sets security headers and hides the framework', async () => {
    const res = await api().get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('only allows configured CORS origins', async () => {
    const allowed = await api()
      .options(`${V1}/notes`)
      .set('Origin', 'http://allowed.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://allowed.example');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await api()
      .options(`${V1}/notes`)
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('limits request body size', async () => {
    const res = await api()
      .post(`${V1}/auth/login`)
      .send({ email: 'a@b.co', password: 'x'.repeat(200_000) });
    expect([res.status, res.body.error.code]).toEqual([413, 'PAYLOAD_TOO_LARGE']);
  });

  it('rate limits with a standard error body', async () => {
    const app = express();
    app.use(createRateLimiter({ windowMs: 60_000, limit: 2, prefix: 'test' }));
    app.get('/', (_req, res) => res.json({ ok: true }));
    await request(app).get('/').expect(200);
    await request(app).get('/').expect(200);
    const limited = await request(app).get('/');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers.ratelimit).toBeDefined();
  });
});

describe('webhooks', () => {
  const event = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', data: { amount: 100 } });
  const post = (body: string, signature?: string) => {
    const req = api().post(`${V1}/webhooks/billing`).set('Content-Type', 'application/json');
    if (signature) req.set('X-Webhook-Signature', signature);
    return req.send(body);
  };

  it('accepts signed events once and acknowledges duplicates', async () => {
    const first = await post(event, signWebhook(env.WEBHOOK_SECRET!, event));
    expect(first.status).toBe(202);
    expect(first.body.data).toEqual({ received: true, duplicate: false });
    const again = await post(event, signWebhook(env.WEBHOOK_SECRET!, event));
    expect(again.body.data.duplicate).toBe(true);
  });

  it('rejects missing, forged, stale and tampered signatures', async () => {
    expect((await post(event)).status).toBe(401);
    expect((await post(event, signWebhook('wrong-secret', event))).status).toBe(401);
    expect(
      (await post(event, signWebhook(env.WEBHOOK_SECRET!, event, Math.floor(Date.now() / 1000) - 3600))).status,
    ).toBe(401);
    expect((await post(event.replace('100', '999'), signWebhook(env.WEBHOOK_SECRET!, event))).status).toBe(401);
  });
});

describe('uploads', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  afterAll(() => fs.rmSync(path.resolve(env.STORAGE_LOCAL_DIR), { recursive: true, force: true }));

  it('stores allowed files under a generated key', async () => {
    const { auth, user } = await authedUser();
    const res = await api()
      .post(`${V1}/uploads`)
      .set(auth)
      .attach('file', png, { filename: '../../etc/passwd.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.key).toMatch(new RegExp(`^${user.id}/[0-9a-f-]{36}\\.png$`));
    expect(fs.existsSync(path.resolve(env.STORAGE_LOCAL_DIR, res.body.data.key))).toBe(true);
    expect(await AuditLog.count({ where: { action: 'upload.created' } })).toBe(1);
  });

  it('rejects disallowed types and spoofed content', async () => {
    const { auth } = await authedUser();
    const html = await api()
      .post(`${V1}/uploads`)
      .set(auth)
      .attach('file', Buffer.from('<html>'), { filename: 'x.html', contentType: 'text/html' });
    expect(html.status).toBe(415);
    const spoofed = await api()
      .post(`${V1}/uploads`)
      .set(auth)
      .attach('file', Buffer.from('<script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(spoofed.status).toBe(415);
    expect((await api().post(`${V1}/uploads`).set(auth)).status).toBe(400);
  });

  it('requires authentication', async () => {
    expect((await api().post(`${V1}/uploads`).attach('file', png, 'a.png')).status).toBe(401);
  });
});

describe('API documentation', () => {
  it('serves the OpenAPI document and Swagger UI', async () => {
    const spec = await api().get('/docs/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');
    expect(spec.body.paths['/auth/login'].post).toBeDefined();
    expect(spec.body.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect((await api().get('/docs/')).status).toBe(200);
  });
});

describe('idempotency middleware', () => {
  it('replays bodiless responses and allows retries after server errors', async () => {
    let calls = 0;
    const test = express();
    test.use(express.json());
    test.post('/empty', idempotency(), (_req, res) => {
      calls += 1;
      res.status(204).end();
    });
    test.post('/flaky', idempotency(), () => {
      calls += 1;
      throw new Error('boom');
    });
    test.use(errorHandler);

    const send = (path: string) =>
      request(test)
        .post(path)
        .set('Idempotency-Key', `key-${path.slice(1)}-1`)
        .send({});
    await send('/empty').expect(204);
    await vi.waitFor(async () => {
      const replay = await send('/empty');
      expect(replay.status).toBe(204);
      expect(replay.headers['idempotent-replayed']).toBe('true');
    });
    expect(calls).toBe(1);

    calls = 0;
    await send('/flaky').expect(500);
    await vi.waitFor(async () => expect((await send('/flaky')).status).toBe(500));
    expect(calls).toBe(2);
  });
});
