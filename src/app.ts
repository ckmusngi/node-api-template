import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { getOpenApiDocument } from './docs/openapi';
import { errorHandler, notFound } from './middleware/error-handler';
import { httpLogger, requestMetrics } from './middleware/http-logger';
import { globalLimiter } from './middleware/rate-limit';
import { requestId } from './middleware/request-id';
import { healthRouter } from './modules/health/health.routes';
import { v1Router } from './routes/v1';
import { CURRENT_API_VERSION, mountApiVersion, versionPath } from './utils/api-version';

function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

const corsOptions: CorsOptions = {
  // Requests without an Origin header (curl, server-to-server) are allowed; browsers must be allowlisted.
  origin: (origin, callback) =>
    callback(null, !origin || env.CORS_ORIGINS.includes('*') || env.CORS_ORIGINS.includes(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Idempotency-Key', 'X-Tenant-Slug'],
  exposedHeaders: [
    'X-Request-ID',
    'RateLimit',
    'RateLimit-Policy',
    'Retry-After',
    'Idempotent-Replayed',
    'API-Version',
  ],
  maxAge: 600,
};

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Needed behind a load balancer so req.ip / rate limiting use the client address.
  app.set('trust proxy', parseTrustProxy(env.TRUST_PROXY));
  app.set('query parser', 'simple');

  app.use(requestId);
  app.use(httpLogger);
  app.use(requestMetrics);
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(compression());

  // Webhooks need the exact raw bytes to verify signatures, so they bypass the JSON parser.
  app.use(`${versionPath(CURRENT_API_VERSION)}/webhooks`, express.raw({ type: '*/*', limit: env.BODY_LIMIT }));
  app.use(express.json({ limit: env.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: env.BODY_LIMIT }));
  app.use(cookieParser());

  // Health checks are excluded from rate limiting so orchestrators can always probe them.
  app.use(healthRouter);

  if (env.SWAGGER_ENABLED) {
    app.get('/docs/openapi.json', (_req, res) => res.json(getOpenApiDocument()));
    app.use(
      '/docs',
      swaggerUi.serve,
      swaggerUi.setup(getOpenApiDocument(), {
        customSiteTitle: `${env.APP_NAME} API docs`,
      }),
    );
  }

  if (env.STORAGE_DRIVER === 'local') {
    app.use(
      '/uploads',
      express.static(path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR), {
        dotfiles: 'deny',
        index: false,
        setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'"),
      }),
    );
  }

  app.use(globalLimiter);
  mountApiVersion(app, CURRENT_API_VERSION, v1Router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
