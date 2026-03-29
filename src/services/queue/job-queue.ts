import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

export interface JobQueue {
  enqueue(name: string, payload: Record<string, unknown>): Promise<void>;
}

class InlineQueue implements JobQueue {
  async enqueue(name: string, payload: Record<string, unknown>) {
    logger.info({ name, payload }, "Inline queue processed job immediately.");
  }
}

class BullMqQueue implements JobQueue {
  private readonly queue: Queue;

  constructor(redisUrl: string) {
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue("cartpilot-jobs", { connection });
  }

  async enqueue(name: string, payload: Record<string, unknown>) {
    await this.queue.add(name, payload);
  }
}

export function createJobQueue(): JobQueue {
  return env.REDIS_URL ? new BullMqQueue(env.REDIS_URL) : new InlineQueue();
}
