import { Job, Queue, Worker } from "bullmq";
import { runUpdateBalanceTask } from "@/trigger/updateBalanceTask.js";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

async function acquireLock(
  customerId: string,
  timeout = 30000
): Promise<boolean> {
  const lockKey = `lock:customer:${customerId}`;
  const acquired = await redis.set(lockKey, "1", "PX", timeout, "NX");
  return acquired === "OK";
}

async function releaseLock(customerId: string): Promise<void> {
  const lockKey = `lock:customer:${customerId}`;
  await redis.del(lockKey);
}

const getRedisConnection = () => {
  let redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  return {
    connection: {
      url: redisUrl,
    },
  };
};

export const initQueue = () => {
  try {
    return new Queue("autumn", getRedisConnection());
  } catch (error) {
    console.error("Error initialising queue:\n", error);
    process.exit(1);
  }
};

// export const clearQueue = async (queue: Queue) => {
//   try {
//     await queue.clean(0, 0, "active");
//     await queue.clean(0, 0, "completed");
//     await queue.clean(0, 0, "failed");
//     await queue.clean(0, 0, "wait");
//     await queue.clean(0, 0, "delayed");
//     console.log("Queue cleared successfully");
//   } catch (error) {
//     console.error("Error clearing queue:", error);
//   }
// };

const numWorkers = 5;

const initWorker = (id: number, queue: Queue) => {
  // Create supabase client

  let worker = new Worker(
    "autumn",
    async (job: Job) => {
      const { customerId } = job.data;

      while (!(await acquireLock(customerId, 10000))) {
        // console.log(`Customer ${customer.id} locked by another worker`);
        await queue.add(job.name, job.data, {
          delay: 50,
        });
        return;
      }

      try {
        await runUpdateBalanceTask(job.data);
      } catch (error) {
        console.error("Error updating balance:", error);
      } finally {
        await releaseLock(customerId);
      }
    },

    {
      ...getRedisConnection(),
      concurrency: 10,
    }
  );

  worker.on("ready", () => {
    console.log(`Worker ${id} ready`);
  });

  worker.on("error", (error) => {
    console.log("WORKER ERROR:\n");
    console.log(error);
    process.exit(1);
  });
};

export const initWorkers = (queue: Queue) => {
  const workers = [];
  for (let i = 0; i < numWorkers; i++) {
    workers.push(initWorker(i, queue));
  }

  return workers;
};
