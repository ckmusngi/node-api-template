import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger';
import { httpRequestDuration } from '../lib/metrics';

const QUIET_PATHS = new Set(['/health', '/ready']);

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as IncomingMessage & { id: string }).id,
  autoLogging: { ignore: (req) => QUIET_PATHS.has(req.url ?? '') },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  // Only log what is useful; headers like Authorization and Cookie are redacted by the base logger.
  serializers: {
    req: (
      req: IncomingMessage & {
        raw?: IncomingMessage;
        id?: string;
        remoteAddress?: string;
      },
    ) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
      userAgent: req.headers['user-agent'],
    }),
    res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
  },
  quietReqLogger: true,
});

/** Records request duration as an OpenTelemetry histogram (no-op unless OTel is enabled). */
export const requestMetrics = (
  req: IncomingMessage & { route?: { path?: string } },
  res: ServerResponse,
  next: () => void,
) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequestDuration.record(seconds, {
      'http.request.method': req.method ?? 'GET',
      'http.response.status_code': res.statusCode,
      'http.route': req.route?.path ?? 'unmatched',
    });
  });
  next();
};
