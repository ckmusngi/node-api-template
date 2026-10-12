import type { AddressInfo } from 'node:net';
import http from 'node:http';
import { WebSocket } from 'ws';
import { cacheKeys } from '../../src/lib/cache';
import { lifecycle } from '../../src/lib/lifecycle';
import { sentMail } from '../../src/lib/mailer';
import { enqueueEmail, startWorkers } from '../../src/lib/queue';
import { getRedis } from '../../src/lib/redis';
import { attachWebSocketServer } from '../../src/lib/websocket';
import { createRateLimiter } from '../../src/middleware/rate-limit';
import { Tenant } from '../../src/models';
import { V1, api, app, authedUser, createUser } from '../helpers/factories';
import express from 'express';
import request from 'supertest';

const redis = getRedis()!;

beforeAll(async () => {
  await redis.flushdb();
});

afterAll(async () => {
  await lifecycle.runShutdownHooks();
});

describe('Redis cache', () => {
  it('caches profiles in Redis and invalidates on update', async () => {
    const { user, auth } = await authedUser();
    await api().get(`${V1}/users/me`).set(auth).expect(200);
    const key = `node-api-template:cache:${cacheKeys.userProfile(user.id)}`;
    expect(await redis.get(key)).toContain(user.email);

    await api().patch(`${V1}/users/me`).set(auth).send({ firstName: 'Cached' }).expect(200);
    expect(await redis.get(key)).toBeNull();
  });
});

describe('Redis rate limit store', () => {
  it('shares counters through Redis', async () => {
    const limited = express();
    limited.use(createRateLimiter({ windowMs: 60_000, limit: 1, prefix: `t${Date.now()}` }));
    limited.get('/', (_req, res) => res.json({ ok: true }));
    await request(limited).get('/').expect(200);
    await request(limited).get('/').expect(429);
    expect((await redis.keys('node-api-template:rl:*')).length).toBeGreaterThan(0);
  });
});

describe('BullMQ background jobs', () => {
  it('sends queued emails through a worker', async () => {
    startWorkers();
    await enqueueEmail({ to: 'queued@example.com', subject: 'Queued', text: 'hello' });
    await vi.waitFor(() => expect(sentMail.some((m) => m.to === 'queued@example.com')).toBe(true), {
      timeout: 10_000,
      interval: 100,
    });
  });
});

describe('WebSocket notifications', () => {
  let server: http.Server;
  let url: string;

  beforeAll(async () => {
    server = http.createServer(app);
    attachWebSocketServer(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('rejects connections without a valid token', async () => {
    const ws = new WebSocket(url);
    const error = await new Promise<Error>((resolve) => ws.on('error', resolve));
    expect(error.message).toMatch(/401/);
  });

  it('pushes note events to the owner', async () => {
    const { auth, token } = await authedUser();
    const ws = new WebSocket(url, ['bearer', token]);
    const messages: { event: string; data: { title?: string } }[] = [];
    ws.on('message', (raw: Buffer) => messages.push(JSON.parse(raw.toString('utf8'))));
    await new Promise((resolve) => ws.on('open', resolve));
    await vi.waitFor(() => expect(messages[0]?.event).toBe('connected'));

    await request(server).post(`${V1}/notes`).set(auth).send({ title: 'Live', content: 'x' }).expect(201);
    await vi.waitFor(() => expect(messages.find((m) => m.event === 'note.created')?.data.title).toBe('Live'));
    ws.close();
  });
});

describe('multi-tenancy', () => {
  it('assigns tenants on registration and isolates data between tenants', async () => {
    const acme = await Tenant.create({ name: 'Acme', slug: 'acme' });
    const globex = await Tenant.create({ name: 'Globex', slug: 'globex' });

    const reg = await api()
      .post(`${V1}/auth/register`)
      .set('X-Tenant-Slug', 'acme')
      .send({ email: 'joe@acme.test', password: 'Password123', firstName: 'Joe', lastName: 'A' });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.tenantId).toBe(acme.id);

    expect(
      (
        await api()
          .post(`${V1}/auth/register`)
          .set('X-Tenant-Slug', 'nope')
          .send({ email: 'x@y.co', password: 'Password123', firstName: 'X', lastName: 'Y' })
      ).status,
    ).toBe(400);

    const acmeAdmin = await authedUser({ role: 'admin', tenantId: acme.id });
    await createUser({ tenantId: globex.id, email: 'hank@globex.test' });
    const globexAdmin = await authedUser({ role: 'admin', tenantId: globex.id });

    const acmeList = await api().get(`${V1}/users`).set(acmeAdmin.auth);
    const emails = acmeList.body.data.map((u: { email: string }) => u.email) as string[];
    expect(emails).toContain('joe@acme.test');
    expect(emails).not.toContain('hank@globex.test');

    // An admin in another tenant cannot see Acme's notes, even with notes:read:any.
    const note = await api().post(`${V1}/notes`).set(acmeAdmin.auth).send({ title: 'Acme secret', content: 'x' });
    expect(note.body.data.tenantId).toBe(acme.id);
    expect((await api().get(`${V1}/notes/${note.body.data.id}`).set(globexAdmin.auth)).status).toBe(404);
    expect((await api().get(`${V1}/notes?scope=all`).set(globexAdmin.auth)).body.data).toHaveLength(0);
  });
});
