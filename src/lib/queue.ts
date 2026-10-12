import { Queue, Worker, type Job, type Processor } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { lifecycle } from './lifecycle';
import { sendMail, type MailMessage } from './mailer';
import { getRedis } from './redis';

export const QUEUE_NAMES = { email: 'email', webhooks: 'webhooks' } as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const queues = new Map<QueueName, Queue>();

function getQueue(name: QueueName): Queue | null {
  if (!env.QUEUE_ENABLED) return null;
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: getRedis()!,
      prefix: env.APP_NAME,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 3_600, count: 1_000 },
        removeOnFail: { age: 7 * 86_400 },
      },
    });
    queues.set(name, queue);
    lifecycle.onShutdown(`queue:${name}`, () => queue!.close());
  }
  return queue;
}

/** Sends email in the background when queues are enabled, or inline otherwise. */
export async function enqueueEmail(message: MailMessage): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.email);
  if (queue) {
    await queue.add('send', message);
    return;
  }
  await sendMail(message);
}

export interface WebhookJob {
  provider: string;
  eventId: string;
  type: string;
  payload: unknown;
}

export const webhookHandlers: Record<string, (job: WebhookJob) => Promise<void>> = {
  async default(job) {
    logger.info({ provider: job.provider, eventId: job.eventId, type: job.type }, 'webhook processed');
  },
};

export async function processWebhook(job: WebhookJob): Promise<void> {
  const handler = webhookHandlers[job.provider] ?? webhookHandlers.default!;
  await handler(job);
}

export async function enqueueWebhook(job: WebhookJob): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.webhooks);
  if (queue) {
    // jobId deduplicates repeated deliveries of the same event.
    await queue.add(job.type, job, { jobId: `${job.provider}-${job.eventId}` });
    return;
  }
  await processWebhook(job);
}

/** Starts workers for every queue. Run in a separate process via `npm run worker`. */
export function startWorkers(): Worker[] {
  const connection = getRedis();
  if (!env.QUEUE_ENABLED || !connection) throw new Error('Workers require QUEUE_ENABLED=true and REDIS_ENABLED=true');

  const processors: Record<QueueName, Processor> = {
    email: (job: Job<MailMessage>) => sendMail(job.data),
    webhooks: (job: Job<WebhookJob>) => processWebhook(job.data),
  };

  return Object.entries(processors).map(([name, processor]) => {
    const worker = new Worker(name, processor, {
      connection,
      prefix: env.APP_NAME,
      concurrency: 5,
    });
    worker.on('completed', (job) => logger.info({ queue: name, jobId: job.id }, 'job completed'));
    worker.on('failed', (job, err) => logger.error({ queue: name, jobId: job?.id, err }, 'job failed'));
    lifecycle.onShutdown(`worker:${name}`, () => worker.close());
    return worker;
  });
}
