/** Background job worker. Run separately from the API: `npm run worker`. */
import { sequelize } from './config/database';
import { logger } from './config/logger';
import { lifecycle } from './lib/lifecycle';
import { startWorkers } from './lib/queue';
import './models';

const workers = startWorkers();
lifecycle.onShutdown('database', () => sequelize.close());
logger.info({ queues: workers.map((w) => w.name) }, 'workers started');

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'stopping workers');
  await lifecycle.runShutdownHooks();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
