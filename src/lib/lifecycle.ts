import { logger } from '../config/logger';

type ShutdownHook = { name: string; fn: () => Promise<void> | void };

const hooks: ShutdownHook[] = [];
let shuttingDown = false;

export const lifecycle = {
  isShuttingDown: () => shuttingDown,
  markShuttingDown: () => {
    shuttingDown = true;
  },
  /** Register a resource to close during graceful shutdown. Hooks run in reverse registration order. */
  onShutdown(name: string, fn: ShutdownHook['fn']) {
    hooks.push({ name, fn });
  },
  async runShutdownHooks() {
    for (const hook of [...hooks].reverse()) {
      try {
        await hook.fn();
        logger.info({ hook: hook.name }, 'shutdown hook completed');
      } catch (err) {
        logger.error({ err, hook: hook.name }, 'shutdown hook failed');
      }
    }
    hooks.length = 0;
  },
};
