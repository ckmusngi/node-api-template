import { IdempotencyKey, Note } from '../../src/models';
import { V1, api, authedUser, createNote } from '../helpers/factories';

describe('notes CRUD', () => {
  it('creates, reads, updates and soft deletes a note', async () => {
    const { auth, user } = await authedUser();
    const created = await api().post(`${V1}/notes`).set(auth).send({ title: 'First', content: 'Hello' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ title: 'First', status: 'draft', userId: user.id });
    const id = created.body.data.id as string;

    expect((await api().get(`${V1}/notes/${id}`).set(auth)).body.data.title).toBe('First');
    const updated = await api().patch(`${V1}/notes/${id}`).set(auth).send({ status: 'published' });
    expect(updated.body.data.status).toBe('published');

    await api().delete(`${V1}/notes/${id}`).set(auth).expect(204);
    expect((await api().get(`${V1}/notes/${id}`).set(auth)).status).toBe(404);
    expect(await Note.findByPk(id, { paranoid: false })).not.toBeNull();

    await api().post(`${V1}/notes/${id}/restore`).set(auth).expect(200);
    expect((await api().get(`${V1}/notes/${id}`).set(auth)).status).toBe(200);
  });

  it('rejects unknown fields (no mass assignment of userId)', async () => {
    const { auth } = await authedUser();
    const res = await api()
      .post(`${V1}/notes`)
      .set(auth)
      .send({ title: 'x', content: 'y', userId: '3f1c2b8e-8a7d-4a51-9f5b-2f6a1d0c9e44' });
    expect(res.status).toBe(422);
  });
});

describe('resource-level authorization', () => {
  it("hides other users' notes", async () => {
    const owner = await authedUser();
    const intruder = await authedUser();
    const note = await createNote(owner.user.id);

    expect((await api().get(`${V1}/notes/${note.id}`).set(intruder.auth)).status).toBe(404);
    expect((await api().patch(`${V1}/notes/${note.id}`).set(intruder.auth).send({ title: 'pwned' })).status).toBe(404);
    expect((await api().delete(`${V1}/notes/${note.id}`).set(intruder.auth)).status).toBe(404);
    expect((await Note.findByPk(note.id))!.title).toBe('A note');

    const list = await api().get(`${V1}/notes`).set(intruder.auth);
    expect(list.body.data).toHaveLength(0);
    expect((await api().get(`${V1}/notes?scope=all`).set(intruder.auth)).status).toBe(403);
  });

  it('lets admins access any note', async () => {
    const owner = await authedUser();
    const admin = await authedUser({ role: 'admin' });
    const note = await createNote(owner.user.id);
    expect((await api().get(`${V1}/notes/${note.id}`).set(admin.auth)).status).toBe(200);
    expect((await api().get(`${V1}/notes?scope=all`).set(admin.auth)).body.data).toHaveLength(1);
  });
});

describe('listing', () => {
  it('paginates, filters, sorts and searches', async () => {
    const { auth, user } = await authedUser();
    await createNote(user.id, { title: 'Alpha', content: 'quarterly report', status: 'published' });
    await createNote(user.id, { title: 'Beta', content: 'shopping list', status: 'draft' });
    await createNote(user.id, { title: 'Gamma', content: 'Quarterly goals', status: 'archived' });

    const sorted = await api().get(`${V1}/notes?sort=-title&limit=2`).set(auth);
    expect(sorted.body.data.map((n: { title: string }) => n.title)).toEqual(['Gamma', 'Beta']);
    expect(sorted.body.meta.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });

    const filtered = await api().get(`${V1}/notes?status=draft,published&sort=title`).set(auth);
    expect(filtered.body.data.map((n: { title: string }) => n.title)).toEqual(['Alpha', 'Beta']);

    const searched = await api().get(`${V1}/notes?search=quarterly&sort=title`).set(auth);
    expect(searched.body.data.map((n: { title: string }) => n.title)).toEqual(['Alpha', 'Gamma']);

    const future = await api().get(`${V1}/notes?createdFrom=2999-01-01`).set(auth);
    expect(future.body.data).toHaveLength(0);
  });

  it('treats injection attempts as plain data', async () => {
    const { auth, user } = await authedUser();
    await createNote(user.id, { title: 'Safe' });
    const res = await api().get(`${V1}/notes`).query({ search: "' OR 1=1 --" }).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect((await api().get(`${V1}/notes?sort=title;DROP TABLE notes`).set(auth)).status).toBe(422);
    expect(await Note.count()).toBe(1);
  });
});

describe('idempotency keys', () => {
  it('replays the original response for a retried request', async () => {
    const { auth } = await authedUser();
    const send = (body: object) =>
      api().post(`${V1}/notes`).set(auth).set('Idempotency-Key', 'create-note-123').send(body);

    const first = await send({ title: 'Once', content: 'x' });
    const retry = await send({ title: 'Once', content: 'x' });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(await Note.count()).toBe(1);

    const mismatch = await send({ title: 'Different', content: 'x' });
    expect([mismatch.status, mismatch.body.error.code]).toEqual([422, 'IDEMPOTENCY_CONFLICT']);
  });

  it('scopes keys per user and rejects malformed keys', async () => {
    const a = await authedUser();
    const b = await authedUser();
    const body = { title: 'Same', content: 'x' };
    await api().post(`${V1}/notes`).set(a.auth).set('Idempotency-Key', 'shared-key-1').send(body).expect(201);
    await api().post(`${V1}/notes`).set(b.auth).set('Idempotency-Key', 'shared-key-1').send(body).expect(201);
    expect(await IdempotencyKey.count()).toBe(2);
    expect((await api().post(`${V1}/notes`).set(a.auth).set('Idempotency-Key', 'bad key!').send(body)).status).toBe(
      400,
    );
  });
});
