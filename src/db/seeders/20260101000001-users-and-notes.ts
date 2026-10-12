import { Op } from 'sequelize';
import { env, isProduction } from '../../config/env';
import { Note, User } from '../../models';
import { hashPassword } from '../../utils/password';
import { schemas } from '../../utils/validation';
import type { Migration } from '../types';

// `||` rather than `??`: a blank line like `SEED_ADMIN_PASSWORD=` in .env yields '' and must count as unset.
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
const DEMO_EMAIL = 'user@example.com';
export const DEFAULT_SEED_PASSWORD = 'Password123!';

export const up: Migration = async () => {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || undefined;
  if (isProduction && !adminPassword) {
    throw new Error('Set SEED_ADMIN_PASSWORD before seeding a production database');
  }
  if (adminPassword && !schemas.password.safeParse(adminPassword).success) {
    throw new Error('SEED_ADMIN_PASSWORD does not meet the password policy (8-72 chars, upper, lower, digit)');
  }
  const password = await hashPassword(adminPassword ?? DEFAULT_SEED_PASSWORD);
  const now = new Date();

  const [admin] = await User.findOrCreate({
    where: { email: ADMIN_EMAIL },
    defaults: {
      email: ADMIN_EMAIL,
      passwordHash: password,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      status: 'active',
      emailVerifiedAt: now,
      tenantId: null,
      lockedUntil: null,
      lastLoginAt: null,
      passwordChangedAt: null,
      deletedAt: null,
    },
  });

  if (isProduction) return;

  const [demo] = await User.findOrCreate({
    where: { email: DEMO_EMAIL },
    defaults: {
      email: DEMO_EMAIL,
      passwordHash: await hashPassword(DEFAULT_SEED_PASSWORD),
      firstName: 'Demo',
      lastName: 'User',
      role: 'user',
      status: 'active',
      emailVerifiedAt: now,
      tenantId: null,
      lockedUntil: null,
      lastLoginAt: null,
      passwordChangedAt: null,
      deletedAt: null,
    },
  });

  await Note.bulkCreate([
    {
      userId: demo.id,
      tenantId: null,
      title: 'Welcome',
      content: `Welcome to ${env.APP_NAME}!`,
      status: 'published',
    },
    {
      userId: demo.id,
      tenantId: null,
      title: 'Draft idea',
      content: 'Something to write about later.',
      status: 'draft',
    },
    {
      userId: admin.id,
      tenantId: null,
      title: 'Admin checklist',
      content: 'Rotate secrets, review audit logs.',
      status: 'published',
    },
  ]);
};

export const down: Migration = async () => {
  const users = await User.findAll({
    where: { email: { [Op.in]: [ADMIN_EMAIL, DEMO_EMAIL] } },
    paranoid: false,
  });
  await Note.destroy({
    where: { userId: users.map((u) => u.id) },
    force: true,
  });
  await User.destroy({ where: { id: users.map((u) => u.id) }, force: true });
};
