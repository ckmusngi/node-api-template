import pino from 'pino';
import { env } from './env';
import { requestContext } from '../utils/request-context';

/** Paths that must never reach the logs. */
export const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-signature"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  'password',
  'token',
  'accessToken',
  'refreshToken',
];

export const logger = pino({
  name: env.APP_NAME,
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[REDACTED]' },
  base: { env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  // Attach the current request's correlation id to every log line written during that request.
  mixin() {
    const ctx = requestContext.get();
    return ctx
      ? {
          requestId: ctx.requestId,
          ...(ctx.userId ? { userId: ctx.userId } : {}),
        }
      : {};
  },
  ...(env.LOG_PRETTY
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
