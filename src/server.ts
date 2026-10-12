import http from 'node:http';
import { createApp } from './app';
import { sequelize } from './config/database';
import { env } from './config/env';
import { logger } from './config/logger';
import { lifecycle } from './lib/lifecycle';
import { getRedis } from './lib/redis';
import { attachWebSocketServer } from './lib/websocket';
import './models';

async function start() {
  await sequelize.authenticate();
  logger.info({ host: env.DB_HOST, database: env.DB_NAME }, 'database connected');
  lifecycle.onShutdown('database', () => sequelize.close());

  getRedis();

  const server = http.createServer(createApp());
  // Keep-alive longer than typical load balancer idle timeouts (AWS ALB: 60s) to avoid 502s.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;

  attachWebSocketServer(server);

  await new Promise<void>((resolve) => server.listen(env.PORT, env.HOST, resolve));
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      docs: env.SWAGGER_ENABLED ? `${env.APP_URL}/docs` : undefined,
    },
    'server listening',
  );

  let shuttingDown = false;
  const shutdown = async (signal: string, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    lifecycle.markShuttingDown();
    logger.info({ signal }, 'shutting down gracefully');

    const forceExit = setTimeout(() => {
      logger.error('graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    // Stop accepting new connections and let in-flight requests finish.
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeIdleConnections();
    });
    await lifecycle.runShutdownHooks();
    logger.info('shutdown complete');
    clearTimeout(forceExit);
    process.exit(exitCode);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled promise rejection');
    void shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    void shutdown('uncaughtException', 1);
  });
}

start().catch((err: unknown) => {
  logger.fatal({ err }, 'failed to start server');
  process.exit(1);
});
