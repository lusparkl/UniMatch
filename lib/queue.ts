import { Queue } from "bullmq";
import { Redis } from "ioredis";
export const redisConnection = () =>
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6381", {
    maxRetriesPerRequest: null,
  });
export function researchQueue() {
  return new Queue("unimatch-research", {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
}
export async function enqueueResearch(universityId: string, targets: string[]) {
  const { db } = await import("./db");
  const active = await db.researchJob.findFirst({
    where: { universityId, status: { in: ["QUEUED", "RUNNING", "RETRYING"] } },
  });
  if (active) throw new Error("This university already has active research");
  const job = await db.researchJob.create({ data: { universityId, targets } });
  const queue = researchQueue();
  try {
    await queue.setGlobalConcurrency(1);
    await queue.add("research", { researchJobId: job.id }, { jobId: job.id });
  } catch (error) {
    await db.researchJob.update({
      where: { id: job.id },
      data: { status: "FAILED", stage: "Failed", errors: [String(error)] },
    });
    throw error;
  } finally {
    const client = await queue.client;
    await queue.close();
    await client.quit();
  }
  return job;
}
