import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const nodeEnv = process.env.NODE_ENV ?? 'development';

// .env.<NODE_ENV> takes precedence over .env; real environment variables win over both.
dotenv.config({
  path: path.resolve(process.cwd(), `.env.${nodeEnv}`),
  quiet: true,
});
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const bool = (defaultValue: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(defaultValue ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const csv = (defaultValue = '') =>
  z
    .string()
    .default(defaultValue)
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );

const duration = z.string().regex(/^\d+(ms|s|m|h|d)$/, 'Expected a duration such as 15m, 7d, 30s');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().default('node-api-template'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    APP_URL: z.url().default('http://localhost:3000'),
    TRUST_PROXY: z.string().default('false'),
    BODY_LIMIT: z.string().default('100kb'),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    LOG_PRETTY: bool(false),

    CORS_ORIGINS: csv(),

    DB_HOST: z.string().default('127.0.0.1'),
    DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().default(''),
    DB_POOL_MIN: z.coerce.number().int().nonnegative().default(0),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_POOL_ACQUIRE_MS: z.coerce.number().int().positive().default(30_000),
    DB_POOL_IDLE_MS: z.coerce.number().int().positive().default(10_000),
    DB_LOGGING: bool(false),
    DB_SSL: bool(false),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: duration.default('15m'),
    JWT_ISSUER: z.string().default('node-api-template'),
    JWT_AUDIENCE: z.string().default('node-api-template-clients'),
    REFRESH_TOKEN_TTL: duration.default('7d'),
    REFRESH_COOKIE_NAME: z.string().default('refresh_token'),
    COOKIE_SECURE: bool(false),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    EMAIL_VERIFICATION_TTL: duration.default('24h'),
    PASSWORD_RESET_TTL: duration.default('1h'),
    REQUIRE_EMAIL_VERIFICATION: bool(false),

    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOGIN_LOCKOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60_000),

    // Optional features
    REDIS_ENABLED: bool(false),
    REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
    CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    QUEUE_ENABLED: bool(false),

    MAIL_TRANSPORT: z.enum(['json', 'smtp']).default('json'),
    MAIL_FROM: z.string().default('No Reply <no-reply@example.com>'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: bool(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('uploads'),
    UPLOAD_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(5 * 1024 * 1024),
    UPLOAD_ALLOWED_MIME: csv('image/png,image/jpeg,image/webp,application/pdf'),
    AWS_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().optional(),

    WEBHOOK_SECRET: z.string().optional(),
    WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),

    IDEMPOTENCY_TTL: duration.default('24h'),

    MULTI_TENANCY_ENABLED: bool(false),
    WS_ENABLED: bool(false),

    OTEL_ENABLED: bool(false),
    OTEL_SERVICE_NAME: z.string().default('node-api-template'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),

    EXTERNAL_API_BASE_URL: z.string().default('https://httpbin.org'),
    EXTERNAL_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),

    SWAGGER_ENABLED: bool(true),
  })
  .superRefine((env, ctx) => {
    if (env.QUEUE_ENABLED && !env.REDIS_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['QUEUE_ENABLED'],
        message: 'QUEUE_ENABLED requires REDIS_ENABLED=true',
      });
    }
    if (env.STORAGE_DRIVER === 's3' && !env.S3_BUCKET) {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_BUCKET'],
        message: 'S3_BUCKET is required when STORAGE_DRIVER=s3',
      });
    }
    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when MAIL_TRANSPORT=smtp',
      });
    }
    if (env.NODE_ENV === 'production') {
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'COOKIE_SECURE must be true in production',
        });
      }
      if (env.CORS_ORIGINS.includes('*')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'Wildcard CORS origin is not allowed in production',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Only print variable names and messages — never the values, which may be secrets.
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${problems}`);
    process.exit(1);
  }
  return Object.freeze(parsed.data);
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
