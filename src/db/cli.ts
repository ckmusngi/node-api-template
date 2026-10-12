/**
 * Database CLI:
 *   tsx src/db/cli.ts migrate            # apply pending migrations
 *   tsx src/db/cli.ts migrate:undo       # revert the last migration
 *   tsx src/db/cli.ts migrate:undo:all   # revert all migrations
 *   tsx src/db/cli.ts migrate:status     # list executed / pending
 *   tsx src/db/cli.ts seed               # run pending seeders
 *   tsx src/db/cli.ts seed:undo:all      # revert all seeders
 *   tsx src/db/cli.ts db:create          # create the database if it does not exist
 *   tsx src/db/cli.ts db:drop            # drop the database (refuses in production)
 */
import { Sequelize } from 'sequelize';
import { buildSequelizeOptions, sequelize } from '../config/database';
import { env, isProduction } from '../config/env';
import { logger } from '../config/logger';
import { createMigrator, createSeeder } from './migrator';

const quoteIdentifier = (name: string) => `\`${name.replace(/`/g, '``')}\``;

async function withServerConnection(fn: (server: Sequelize) => Promise<void>) {
  const server = new Sequelize(buildSequelizeOptions({ database: undefined }));
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

async function main(command: string | undefined) {
  const migrator = createMigrator(sequelize);
  const seeder = createSeeder(sequelize);

  switch (command) {
    case 'db:create':
      await withServerConnection((s) =>
        s
          .query(
            `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(env.DB_NAME)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
          )
          .then(() => undefined),
      );
      logger.info({ database: env.DB_NAME }, 'database ready');
      return;
    case 'db:drop':
      if (isProduction) throw new Error('Refusing to drop the database in production');
      await withServerConnection((s) =>
        s.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(env.DB_NAME)}`).then(() => undefined),
      );
      logger.info({ database: env.DB_NAME }, 'database dropped');
      return;
    case 'migrate':
      await migrator.up();
      return;
    case 'migrate:undo':
      await migrator.down();
      return;
    case 'migrate:undo:all':
      if (isProduction) throw new Error('Refusing to revert all migrations in production');
      await migrator.down({ to: 0 });
      return;
    case 'migrate:status': {
      const executed = (await migrator.executed()).map((m) => m.name);
      const pending = (await migrator.pending()).map((m) => m.name);
      // eslint-disable-next-line no-console
      console.table([
        ...executed.map((name) => ({ name, status: 'executed' })),
        ...pending.map((name) => ({ name, status: 'pending' })),
      ]);
      return;
    }
    case 'seed':
      await seeder.up();
      return;
    case 'seed:undo:all':
      await seeder.down({ to: 0 });
      return;
    default:
      throw new Error(`Unknown command "${command ?? ''}"`);
  }
}

main(process.argv[2])
  .then(() => sequelize.close())
  .catch(async (err: unknown) => {
    logger.error({ err }, 'database command failed');
    await sequelize.close().catch(() => undefined);
    process.exit(1);
  });
