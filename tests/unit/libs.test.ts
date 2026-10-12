import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosError } from 'axios';
import { memoryCache } from '../../src/lib/cache';
import { createHttpClient } from '../../src/lib/http-client';
import { requestContext } from '../../src/utils/request-context';

describe('memory cache', () => {
  beforeEach(() => memoryCache.clear());

  it('stores, expires and deletes values', async () => {
    await memoryCache.set('a', { n: 1 }, 60);
    expect(await memoryCache.get('a')).toEqual({ n: 1 });
    await memoryCache.del('a');
    expect(await memoryCache.get('a')).toBeUndefined();
  });

  it('wraps loaders and only calls them on a miss', async () => {
    const loader = vi.fn().mockResolvedValue('value');
    expect(await memoryCache.wrap('k', 60, loader)).toBe('value');
    expect(await memoryCache.wrap('k', 60, loader)).toBe('value');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('supports set-if-absent', async () => {
    expect(await memoryCache.setIfAbsent('once', true)).toBe(true);
    expect(await memoryCache.setIfAbsent('once', true)).toBe(false);
  });
});

describe('http client', () => {
  const ok = (config: InternalAxiosRequestConfig) => ({
    data: { ok: true },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
  const fail = (config: InternalAxiosRequestConfig, status: number) =>
    new AxiosError('fail', 'ERR_BAD_RESPONSE', config, null, { data: {}, status, statusText: '', headers: {}, config });

  it('retries idempotent requests on 5xx then succeeds', async () => {
    let calls = 0;
    const adapter: AxiosAdapter = async (config) => {
      calls += 1;
      if (calls < 3) throw fail(config, 503);
      return ok(config);
    };
    const client = createHttpClient({ adapter, retryBaseDelayMs: 1 });
    const res = await client.get('/thing');
    expect(res.data).toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it('does not retry POST or 4xx', async () => {
    let calls = 0;
    const adapter: AxiosAdapter = async (config) => {
      calls += 1;
      throw fail(config, config.method === 'post' ? 503 : 404);
    };
    const client = createHttpClient({ adapter, retryBaseDelayMs: 1 });
    await expect(client.post('/x')).rejects.toThrow();
    await expect(client.get('/x')).rejects.toThrow();
    expect(calls).toBe(2);
  });

  it('propagates the request id', async () => {
    let seen: unknown;
    const adapter: AxiosAdapter = async (config) => {
      seen = config.headers.get('X-Request-ID');
      return ok(config);
    };
    const client = createHttpClient({ adapter });
    await requestContext.run({ requestId: 'req-123' }, () => client.get('/'));
    expect(seen).toBe('req-123');
  });
});
