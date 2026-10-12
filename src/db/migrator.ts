import path from 'node:path';
import { SequelizeStorage, Umzug } from 'umzug';
import type { Sequelize } from 'sequelize';
import { logger } from '../config/logger';
import type { Migration, MigrationContext } from './types';

// Works from both src/ (tsx) and dist/ (compiled JS). Excludes .d.ts and source maps.
const pattern = (dir: string) => path.join(__dirname, dir, '*.{ts,js}').replace(/\\/g, '/');

function build(sequelize: Sequelize, dir: 'migrations' | 'seeders', tableName: string) {
  return new Umzug<MigrationContext>({
    migrations: {
      glob: [pattern(dir), { ignore: ['**/*.d.ts'] }],
      // Store names without the extension so src/*.ts and dist/*.js runs share one history.
      resolve: ({ name, path: filePath, context }) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const migration = require(filePath!) as { up: Migration; down?: Migration };
        return {
          name: name.replace(/\.(ts|js)$/, ''),
          up: () => migration.up({ name, path: filePath, context }),
          down: async () => {
            await migration.down?.({ name, path: filePath, context });
          },
        };
      },
    },
    context: { queryInterface: sequelize.getQueryInterface(), sequelize },
    // Distinct model names: both storages share one Sequelize instance.
    storage: new SequelizeStorage({ sequelize, tableName, modelName: `Umzug_${tableName}` }),
    logger: {
      info: (msg) => logger.info(msg, dir),
      warn: (msg) => logger.warn(msg, dir),
      error: (msg) => logger.error(msg, dir),
      debug: (msg) => logger.debug(msg, dir),
    },
  });
}

export const createMigrator = (sequelize: Sequelize) => build(sequelize, 'migrations', 'sequelize_migrations');
export const createSeeder = (sequelize: Sequelize) => build(sequelize, 'seeders', 'sequelize_seeders');
