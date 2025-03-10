import { Job, Queue, Worker } from "bullmq";
import { runUpdateBalanceTask } from "@/trigger/updateBalanceTask.js";
import { QueueManager } from "./QueueManager.js";
import { createLogtail } from "@/external/logtail/logtailUtils.js";
import { runUpdateUsageTask } from "@/trigger/updateUsageTask.js";
import { JobName } from "./JobName.js";

const NUM_WORKERS = 5;

export const getRedisConnection = ({
  useBackup = false,
}: {
  useBackup?: boolean;
}) => {
  let redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  if (useBackup) {
    redisUrl = process.env.REDIS_BACKUP_URL || "redis://localhost:6379";
  }

  return {
    connection: {
      url: redisUrl,
      // enableOfflineQueue: false,
    },
  };
};

async function acquireLock({
  customerId,
  timeout = 30000,
  useBackup = false,
}: {
  customerId: string;
  timeout?: number;
  useBackup?: boolean;
}): Promise<boolean> {
  // const redis = getRedisClient({ useBackup });
  const redis = await QueueManager.getConnection({ useBackup });

  const lockKey = `lock:customer:${customerId}`;
  const acquired = await redis.set(lockKey, "1", "PX", timeout, "NX");
  return acquired === "OK";
}

async function releaseLock({
  customerId,
  useBackup,
}: {
  customerId: string;
  useBackup: boolean;
}): Promise<void> {
  const redis = await QueueManager.getConnection({ useBackup });
  const lockKey = `lock:customer:${customerId}`;
  await redis.del(lockKey);
}

const initWorker = ({
  id,
  queue,
  useBackup,
  logtail,
}: {
  id: number;
  queue: Queue;
  useBackup: boolean;
  logtail: any;
}) => {
  let worker = new Worker(
    "autumn",
    async (job: Job) => {
      // console.log("JOB ID:", job.id, `(${useBackup ? "BACKUP" : "MAIN"})`);
      // console.log("EVENT ID:", job.data.event.id);
      const { customerId } = job.data;

      while (!(await acquireLock({ customerId, timeout: 10000, useBackup }))) {
        await queue.add(job.name, job.data, {
          delay: 50,
        });
        return;
      }

      try {
        if (job.name === JobName.UpdateBalance) {
          await runUpdateBalanceTask({ payload: job.data, logger: logtail });
        } else if (job.name === JobName.UpdateUsage) {
          await runUpdateUsageTask({ payload: job.data, logger: logtail });
        }
      } catch (error) {
        console.error("Error updating balance:", error);
      } finally {
        await releaseLock({ customerId, useBackup });
      }
    },
    {
      ...getRedisConnection({ useBackup }),
      concurrency: 1,
      removeOnComplete: {
        count: 0,
      },
      removeOnFail: {
        count: 0,
      },
      drainDelay: 1000,
      maxStalledCount: 0,
    }
  );

  worker.on("ready", () => {
    console.log(`Worker ${id} ready (${useBackup ? "BACKUP" : "MAIN"})`);
  });

  worker.on("stalled", (jobId: string) => {
    console.log(`Worker ${id} stalled (${useBackup ? "BACKUP" : "MAIN"})`);
    console.log("JOB ID:", jobId);
  });

  // Check jobs left in queue

  worker.on("error", async (error: any) => {
    if (error.code !== "ECONNREFUSED") {
      console.log("WORKER ERROR:", error.message);
    }
  });

  worker.on("failed", (job, error) => {
    console.log("WORKER FAILED:", error.message);
  });
};

export const initWorkers = async () => {
  const workers = [];

  const mainQueue = await QueueManager.getQueue({ useBackup: false });
  const backupQueue = await QueueManager.getQueue({ useBackup: true });
  const logtail = createLogtail();

  for (let i = 0; i < NUM_WORKERS; i++) {
    workers.push(
      initWorker({ id: i, queue: mainQueue, useBackup: false, logtail })
    );
    workers.push(
      initWorker({ id: i, queue: backupQueue, useBackup: true, logtail })
    );
  }

  // Get stalled jobs

  return workers;
};
