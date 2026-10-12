import { rateLimit, type Options } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { env } from '../config/env';
import { getRedis } from '../lib/redis';
import { ApiResponse } from '../utils/api-response';
import { ErrorCode } from '../utils/app-error';
import { HttpStatus } from '../utils/http-status';

interface LimiterOptions {
  windowMs: number;
  limit: number;
  prefix: string;
  keyGenerator?: Options['keyGenerator'];
  skipSuccessfulRequests?: boolean;
}

/** Rate limiter backed by Redis when enabled (shared across instances), memory otherwise. */
export function createRateLimiter({ windowMs, limit, prefix, keyGenerator, skipSuccessfulRequests }: LimiterOptions) {
  const redis = getRedis();
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests,
    ...(keyGenerator ? { keyGenerator } : {}),
    ...(redis
      ? {
          store: new RedisStore({
            prefix: `${env.APP_NAME}:rl:${prefix}:`,
            sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<RedisReply>,
          }),
        }
      : {}),
    handler: (_req, res) => {
      ApiResponse.error(
        res,
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.RATE_LIMITED,
        'Too many requests, please try again later',
      );
    },
  });
}

export const globalLimiter = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  prefix: 'global',
});

/** Stricter limit for credential endpoints (login, register, password reset). */
export const authLimiter = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  prefix: 'auth',
});
