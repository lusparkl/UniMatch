import type { Job } from "bullmq";
import { db } from "../lib/db";
import { runResearch } from "../lib/research/pipeline";
export async function processResearchJob(job: Job<{ researchJobId: string }>) {
  try {
    await runResearch(job.data.researchJobId);
  } catch (error) {
    const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await db.researchJob.update({
      where: { id: job.data.researchJobId },
      data: {
        status: final ? "FAILED" : "RETRYING",
        stage: final ? "Failed" : "Queued",
        errors: { push: String(error) },
        ...(final ? { completedAt: new Date() } : {}),
      },
    });
    await db.researchLog.create({
      data: {
        jobId: job.data.researchJobId,
        level: "ERROR",
        message: "Attempt " + (job.attemptsMade + 1) + ": " + String(error),
      },
    });
    throw error;
  }
}
