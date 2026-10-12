import axios, {
  type AxiosError,
  type AxiosInstance,
  type CreateAxiosDefaults,
  type InternalAxiosRequestConfig,
} from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { requestContext } from '../utils/request-context';

const RETRYABLE_METHODS = new Set(['get', 'head', 'options', 'put', 'delete']);

interface RetryConfig extends InternalAxiosRequestConfig {
  __retryCount?: number;
}

export interface HttpClientOptions extends CreateAxiosDefaults {
  /** Retries for idempotent requests on network errors, 429 and 5xx. */
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

/**
 * Axios instance for calling external APIs: timeouts, request id propagation,
 * structured logging and retries with exponential backoff.
 */
export function createHttpClient({
  maxRetries = 2,
  retryBaseDelayMs = 200,
  ...config
}: HttpClientOptions = {}): AxiosInstance {
  const client = axios.create({
    timeout: env.EXTERNAL_API_TIMEOUT_MS,
    ...config,
  });

  client.interceptors.request.use((req) => {
    const requestId = requestContext.get()?.requestId;
    if (requestId) req.headers.set('X-Request-ID', requestId);
    return req;
  });

  client.interceptors.response.use(undefined, async (error: AxiosError) => {
    const req = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    const retryable =
      !!req &&
      RETRYABLE_METHODS.has((req.method ?? 'get').toLowerCase()) &&
      (!error.response || status === 429 || (status !== undefined && status >= 500));

    if (req && retryable && (req.__retryCount ?? 0) < maxRetries) {
      req.__retryCount = (req.__retryCount ?? 0) + 1;
      const delay = retryBaseDelayMs * 2 ** (req.__retryCount - 1);
      logger.warn({ url: req.url, status, attempt: req.__retryCount, delay }, 'retrying external request');
      await new Promise((resolve) => setTimeout(resolve, delay));
      return client.request(req);
    }

    logger.error({ url: req?.url, method: req?.method, status, code: error.code }, 'external request failed');
    throw error;
  });

  return client;
}

/** Example client for a configured third-party API. */
export const externalApi = createHttpClient({
  baseURL: env.EXTERNAL_API_BASE_URL,
});
