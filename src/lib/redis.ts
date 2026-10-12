import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { lifecycle } from './lifecycle';

let client: Redis | null = null;

/** Shared Redis connection, or null when REDIS_ENABLED=false. */
export function getRedis(): Redis | null {
  if (!env.REDIS_ENABLED) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      // BullMQ requires this to be null for blocking commands.
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on('error', (err) => logger.error({ err }, 'redis error'));
    client.on('ready', () => logger.info('redis connected'));
    lifecycle.onShutdown('redis', async () => {
      await client?.quit();
      client = null;
    });
  }
  return client;
}

export async function checkRedis(): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
} | null> {
  const redis = getRedis();
  if (!redis) return null;
  const started = Date.now();
  try {
    await redis.ping();
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: (err as Error).message,
    };
  }
}
