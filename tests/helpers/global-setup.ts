import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** Databases used by the Vitest projects (see vitest.config.mts). Each is rebuilt per run. */
const TEST_DATABASES = ['node_api_template_test', 'node_api_template_optional_test'];

export default function setup() {
  const root = path.resolve(__dirname, '../..');
  for (const database of TEST_DATABASES) {
    execFileSync(process.execPath, ['--import', 'tsx', path.join(root, 'tests/helpers/reset-test-db.ts')], {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'test', DB_NAME: database },
      stdio: 'inherit',
    });
  }
}
