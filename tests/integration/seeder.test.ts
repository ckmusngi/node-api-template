import { down, up } from '../../src/db/seeders/20260101000001-users-and-notes';
import type { MigrationContext } from '../../src/db/types';
import { Note, sequelize } from '../../src/models';
import { V1, api } from '../helpers/factories';

const context: MigrationContext = { queryInterface: sequelize.getQueryInterface(), sequelize };
const run = (fn: typeof up) => fn({ name: 'seed', context });

describe('users-and-notes seeder', () => {
  const original = process.env.SEED_ADMIN_PASSWORD;
  afterEach(() => {
    process.env.SEED_ADMIN_PASSWORD = original;
  });

  it('treats a blank SEED_ADMIN_PASSWORD (as in .env.example) as unset', async () => {
    process.env.SEED_ADMIN_PASSWORD = '';
    await run(up);
    const admin = await api().post(`${V1}/auth/login`).send({ email: 'admin@example.com', password: 'Password123!' });
    expect(admin.status).toBe(200);
    expect(admin.body.data.user.role).toBe('admin');
    const demo = await api().post(`${V1}/auth/login`).send({ email: 'user@example.com', password: 'Password123!' });
    expect(demo.status).toBe(200);
    expect(await Note.count()).toBe(3);
  });

  it('uses SEED_ADMIN_PASSWORD when provided and rejects weak values', async () => {
    process.env.SEED_ADMIN_PASSWORD = 'Custom-Admin-9';
    await run(up);
    expect(
      (await api().post(`${V1}/auth/login`).send({ email: 'admin@example.com', password: 'Custom-Admin-9' })).status,
    ).toBe(200);
    await run(down);

    process.env.SEED_ADMIN_PASSWORD = 'weak';
    await expect(run(up)).rejects.toThrow(/password policy/);
  });
});
