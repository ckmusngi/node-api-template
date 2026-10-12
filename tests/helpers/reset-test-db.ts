/**
 * Recreates the isolated test database and applies all migrations.
 * Run by the Vitest global setup in a child process (plain tsx, outside Vite's module runner).
 */
import { Sequelize } from 'sequelize';
import { buildSequelizeOptions, sequelize } from '../../src/config/database';
import { env } from '../../src/config/env';
import { createMigrator } from '../../src/db/migrator';

async function main() {
  if (env.NODE_ENV !== 'test' || !env.DB_NAME.endsWith('_test')) {
    throw new Error(`Refusing to reset non-test database "${env.DB_NAME}"`);
  }
  const server = new Sequelize(buildSequelizeOptions({ database: undefined, logging: false }));
  await server.query(`DROP DATABASE IF EXISTS \`${env.DB_NAME}\``);
  await server.query(`CREATE DATABASE \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await server.close();
  await createMigrator(sequelize).up();
  await sequelize.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
