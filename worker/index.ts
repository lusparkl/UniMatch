import "dotenv/config";
import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue";
import { db } from "../lib/db";
import { processResearchJob } from "./processor";
const connection = redisConnection();
const worker = new Worker("unimatch-research", processResearchJob, {
  connection,
  concurrency: 1,
});
worker.on("error", (error) => console.error("Worker error:", error.message));
console.log("UniMatch research worker ready. Global queue concurrency: 1.");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await worker.close();
    await connection.quit();
    await db.$disconnect();
    process.exit(0);
  });
