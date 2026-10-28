import { db } from "../lib/db";
import { runResearch } from "../lib/research/pipeline";
if (process.env.LIVE_OPENAI_TEST !== "1")
  throw new Error(
    "Opt in with LIVE_OPENAI_TEST=1. This test uses OpenAI credits and official websites.",
  );
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
process.env.MAX_CRAWL_PAGES = "1";
process.env.MAX_AI_CALLS_PER_JOB = "2";
try {
  const university = await db.university.findUniqueOrThrow({
    where: { id: process.env.LIVE_UNIVERSITY_ID ?? "debrecen" },
  });
  const job = await db.researchJob.create({
    data: {
      universityId: university.id,
      targets: [
        "Computer Science program admissions, tuition and scholarships",
      ],
    },
  });
  await runResearch(job.id);
  const result = await db.researchJob.findUniqueOrThrow({
    where: { id: job.id },
    include: { candidates: true },
  });
  console.log(
    JSON.stringify(
      {
        jobId: job.id,
        status: result.status,
        pages: result.pagesProcessed,
        calls: result.modelCalls,
        tokens: result.tokenUsage,
        candidates: result.candidates.length,
        errors: result.errors,
      },
      null,
      2,
    ),
  );
  if (!result.candidates.length || result.tokenUsage === 0)
    throw new Error(
      "Live smoke did not produce a metered extraction. Inspect admin logs.",
    );
} finally {
  await db.$disconnect();
}
