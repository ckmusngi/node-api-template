import { metrics } from '@opentelemetry/api';
import { env } from '../config/env';

// When OpenTelemetry is not enabled these resolve to no-op instruments.
const meter = metrics.getMeter(env.OTEL_SERVICE_NAME);

export const httpRequestDuration = meter.createHistogram('http.server.request.duration', {
  description: 'Duration of HTTP requests',
  unit: 's',
});

export const authEvents = meter.createCounter('app.auth.events', {
  description: 'Authentication events by outcome',
});
