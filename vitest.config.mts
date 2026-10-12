import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['tests/helpers/global-setup.ts'],
    setupFiles: ['tests/helpers/setup.ts'],
    // Integration tests share a database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
          env: { NODE_ENV: 'test' },
        },
      },
      {
        // Optional features switched on; needs Redis (see docker-compose.yml).
        extends: true,
        test: {
          name: 'optional',
          include: ['tests/optional/**/*.test.ts'],
          env: {
            NODE_ENV: 'test',
            DB_NAME: 'node_api_template_optional_test',
            REDIS_ENABLED: 'true',
            REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15',
            QUEUE_ENABLED: 'true',
            WS_ENABLED: 'true',
            MULTI_TENANCY_ENABLED: 'true',
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/server.ts',
        'src/worker.ts',
        'src/instrumentation.ts',
        'src/db/cli.ts',
        'src/types/**',
        'src/**/*.d.ts',
      ],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      thresholds: { lines: 75, functions: 70, branches: 60, statements: 75 },
    },
  },
});
