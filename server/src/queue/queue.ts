import { Job, Queue, Worker } from "bullmq";
import { runUpdateBalanceTask } from "@/trigger/updateBalanceTask.js";
import { QueueManager } from "./QueueManager.js";
import { createLogtail } from "@/external/logtail/logtailUtils.js";
import { runUpdateUsageTask } from "@/trigger/updateUsageTask.js";
import { JobName } from "./JobName.js";
import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { runMigrationTask } from "@/internal/migrations/runMigrationTask.js";
import { runTriggerCheckoutReward } from "@/internal/rewards/triggerCheckoutReward.js";
import { runSaveFeatureDisplayTask } from "@/internal/features/featureUtils.js";
import { CacheManager } from "@/external/caching/CacheManager.js";
import { sendProductsUpdatedWebhook } from "@/external/svix/handleProductsUpdatedWebhook.js";
import { DrizzleCli, initDrizzle } from "@/db/initDrizzle.js";

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
  sb,
  db,
}: {
  id: number;
  queue: Queue;
  useBackup: boolean;
  logtail: any;
  sb: SupabaseClient;
  db: DrizzleCli;
}) => {
  let worker = new Worker(
    "autumn",
    async (job: Job) => {
      if (job.name == JobName.GenerateFeatureDisplay) {
        await runSaveFeatureDisplayTask({
          sb,
          db,
          feature: job.data.feature,
          org: job.data.org,
          logger: logtail,
        });
        return;
      }
      if (job.name == JobName.Migration) {
        await runMigrationTask({
          payload: job.data,
          logger: logtail,
          sb,
        });
        return;
      }

      if (job.name == JobName.SendProductsUpdatedWebhook) {
        let lockKey = `${job.name}:${job.data.internalCustomerId}`;
        if (
          !(await acquireLock({
            customerId: lockKey,
            timeout: 10000,
            useBackup,
          }))
        ) {
          await queue.add(job.name, job.data, {
            delay: 1000,
          });
          return;
        }

        try {
          await sendProductsUpdatedWebhook({
            sb,
            logger: logtail,
            data: job.data,
          });
        } catch (error) {
          console.error("Error processing job:", error);
        } finally {
          await releaseLock({ customerId: lockKey, useBackup });
        }
      }

      // TRIGGER CHECKOUT REWARD
      if (job.name == JobName.TriggerCheckoutReward) {
        let lockKey = `reward_trigger:${job.data.customer?.internal_id}`;
        if (
          !(await acquireLock({
            customerId: lockKey,
            timeout: 10000,
            useBackup,
          }))
        ) {
          await queue.add(job.name, job.data, {
            delay: 1000,
          });
          return;
        }

        try {
          await runTriggerCheckoutReward({
            payload: job.data,
            sb,
            logger: logtail,
          });
        } catch (error) {
          console.error("Error processing job:", error);
        } finally {
          await releaseLock({ customerId: lockKey, useBackup });
        }

        return;
      }

      const { internalCustomerId } = job.data; // customerId is internal customer id

      while (
        !(await acquireLock({
          customerId: internalCustomerId,
          timeout: 10000,
          useBackup,
        }))
      ) {
        await queue.add(job.name, job.data, {
          delay: 50,
        });
        return;
      }

      try {
        if (job.name === JobName.UpdateBalance) {
          await runUpdateBalanceTask({
            payload: job.data,
            logger: logtail,
            sb,
          });
        } else if (job.name === JobName.UpdateUsage) {
          await runUpdateUsageTask({ payload: job.data, logger: logtail, sb });
        }
      } catch (error) {
        console.error("Error processing job:", error);
      } finally {
        await releaseLock({ customerId: internalCustomerId, useBackup });
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
    },
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
  await CacheManager.getInstance();
  const logtail = createLogtail();
  const sb = createSupabaseClient();
  const { db, client } = initDrizzle();

  for (let i = 0; i < NUM_WORKERS; i++) {
    workers.push(
      initWorker({
        id: i,
        queue: mainQueue,
        useBackup: false,
        logtail,
        sb,
        db,
      }),
    );
    workers.push(
      initWorker({
        id: i,
        queue: backupQueue,
        useBackup: true,
        logtail,
        sb,
        db,
      }),
    );
  }

  // Get stalled jobs

  return workers;
};
