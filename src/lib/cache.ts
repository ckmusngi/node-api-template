import { env } from '../config/env';
import { logger } from '../config/logger';
import { getRedis } from './redis';

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  /** Sets only if the key does not already exist. Returns true when the key was set. */
  setIfAbsent(key: string, value: unknown, ttlSeconds?: number): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>;
}

const PREFIX = `${env.APP_NAME}:cache:`;

class MemoryCache implements Cache {
  private store = new Map<string, { value: string; expiresAt: number }>();
  private readonly maxEntries = 10_000;

  async get<T>(key: string) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return JSON.parse(entry.value) as T;
  }
  async set(key: string, value: unknown, ttlSeconds = env.CACHE_TTL_SECONDS) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      value: JSON.stringify(value),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
  async setIfAbsent(key: string, value: unknown, ttlSeconds = env.CACHE_TTL_SECONDS) {
    if ((await this.get(key)) !== undefined) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }
  async del(...keys: string[]) {
    for (const key of keys) this.store.delete(key);
  }
  async wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>) {
    const hit = await this.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }
  clear() {
    this.store.clear();
  }
}

class RedisCache implements Cache {
  private get redis() {
    return getRedis()!;
  }
  async get<T>(key: string) {
    const raw = await this.redis.get(PREFIX + key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }
  async set(key: string, value: unknown, ttlSeconds = env.CACHE_TTL_SECONDS) {
    await this.redis.set(PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds);
  }
  async setIfAbsent(key: string, value: unknown, ttlSeconds = env.CACHE_TTL_SECONDS) {
    const result = await this.redis.set(PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }
  async del(...keys: string[]) {
    if (keys.length) await this.redis.del(...keys.map((k) => PREFIX + k));
  }
  async wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>) {
    try {
      const hit = await this.get<T>(key);
      if (hit !== undefined) return hit;
    } catch (err) {
      // A cache outage should degrade to the source of truth, not fail the request.
      logger.warn({ err, key }, 'cache read failed');
      return loader();
    }
    const value = await loader();
    await this.set(key, value, ttlSeconds).catch((err: unknown) => logger.warn({ err, key }, 'cache write failed'));
    return value;
  }
}

export const memoryCache = new MemoryCache();
export const cache: Cache = env.REDIS_ENABLED ? new RedisCache() : memoryCache;

export const cacheKeys = {
  userProfile: (userId: string) => `user:${userId}:profile`,
};
