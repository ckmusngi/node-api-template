import { Sequelize, type Options } from 'sequelize';
import { env } from './env';
import { logger } from './logger';

export function buildSequelizeOptions(overrides: Partial<Options> = {}): Options {
  return {
    dialect: 'mysql',
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    timezone: '+00:00',
    logging: env.DB_LOGGING ? (sql: string) => logger.debug({ sql }, 'sql') : false,
    benchmark: env.DB_LOGGING,
    pool: {
      min: env.DB_POOL_MIN,
      max: env.DB_POOL_MAX,
      acquire: env.DB_POOL_ACQUIRE_MS,
      idle: env.DB_POOL_IDLE_MS,
    },
    dialectOptions: {
      charset: 'utf8mb4',
      dateStrings: false,
      ...(env.DB_SSL ? { ssl: { rejectUnauthorized: true } } : {}),
    },
    define: {
      underscored: true,
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
    ...overrides,
  };
}

export const sequelize = new Sequelize(buildSequelizeOptions());

export async function checkDatabase(): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}> {
  const started = Date.now();
  try {
    await sequelize.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: (err as Error).message,
    };
  }
}
