/**
 * OpenTelemetry bootstrap. Must be loaded before any other module so auto-instrumentation
 * can patch http, express, mysql2, ioredis and pino.:
 *   node --require ./dist/instrumentation.js dist/server.js
 * It is a no-op unless OTEL_ENABLED=true.
 */
/* eslint-disable @typescript-eslint/consistent-type-imports -- modules are loaded lazily so they cost nothing when disabled */
import { env } from './config/env';

if (env.OTEL_ENABLED) {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { NodeSDK } = require('@opentelemetry/sdk-node') as typeof import('@opentelemetry/sdk-node');
  const { HttpInstrumentation } =
    require('@opentelemetry/instrumentation-http') as typeof import('@opentelemetry/instrumentation-http');
  const { ExpressInstrumentation } =
    require('@opentelemetry/instrumentation-express') as typeof import('@opentelemetry/instrumentation-express');
  const { MySQL2Instrumentation } =
    require('@opentelemetry/instrumentation-mysql2') as typeof import('@opentelemetry/instrumentation-mysql2');
  const { IORedisInstrumentation } =
    require('@opentelemetry/instrumentation-ioredis') as typeof import('@opentelemetry/instrumentation-ioredis');
  const { PinoInstrumentation } =
    require('@opentelemetry/instrumentation-pino') as typeof import('@opentelemetry/instrumentation-pino');
  const { OTLPTraceExporter } =
    require('@opentelemetry/exporter-trace-otlp-http') as typeof import('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } =
    require('@opentelemetry/exporter-metrics-otlp-http') as typeof import('@opentelemetry/exporter-metrics-otlp-http');
  const { PeriodicExportingMetricReader } =
    require('@opentelemetry/sdk-metrics') as typeof import('@opentelemetry/sdk-metrics');
  const { resourceFromAttributes } = require('@opentelemetry/resources') as typeof import('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME } =
    require('@opentelemetry/semantic-conventions') as typeof import('@opentelemetry/semantic-conventions');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '');
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
      'deployment.environment': env.NODE_ENV,
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: 15_000,
      }),
    ],
    // Explicit list (instead of the auto-instrumentations bundle) keeps the dependency tree small.
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new MySQL2Instrumentation(),
      new IORedisInstrumentation(),
      new PinoInstrumentation(),
    ],
  });
  sdk.start();

  const shutdown = () => sdk.shutdown().catch(() => undefined);
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
