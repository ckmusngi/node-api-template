import type { QueryInterface, Sequelize } from 'sequelize';
import type { MigrationFn } from 'umzug';

export interface MigrationContext {
  queryInterface: QueryInterface;
  sequelize: Sequelize;
}

export type Migration = MigrationFn<MigrationContext>;
