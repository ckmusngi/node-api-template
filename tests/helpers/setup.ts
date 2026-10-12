import { afterAll, beforeEach } from 'vitest';
import { memoryCache } from '../../src/lib/cache';
import { sentMail } from '../../src/lib/mailer';
import { sequelize } from '../../src/models';

const TABLES = ['audit_logs', 'idempotency_keys', 'refresh_tokens', 'user_tokens', 'notes', 'users', 'tenants'];

/** Every test starts from empty tables. */
beforeEach(async () => {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TABLES) await sequelize.query(`TRUNCATE TABLE \`${table}\``);
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  memoryCache.clear();
  sentMail.length = 0;
});

afterAll(async () => {
  await sequelize.close();
});
