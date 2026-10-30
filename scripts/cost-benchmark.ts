import { appendFileSync } from "node:fs";
import { db } from "../lib/db";
import { runResearch } from "../lib/research/pipeline";
if (process.env.LIVE_OPENAI_TEST !== "1")
  throw new Error(
    "Opt in with LIVE_OPENAI_TEST=1. This benchmark uses OpenAI credits and official websites.",
  );
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
// USD per 1M tokens, from https://developers.openai.com/api/docs/models/gpt-5.4-mini (checked 2026-10-29).
const PRICE = { input: 0.75, output: 4.5 };
const universityId = process.env.LIVE_UNIVERSITY_ID ?? "hkust";
process.env.MAX_CRAWL_PAGES ??= "30";
process.env.MAX_CRAWL_DEPTH ??= "2";
process.env.MAX_AI_CALLS_PER_JOB ??= "15";
try {
  const job = await db.researchJob.create({
    data: {
      universityId,
      targets: [
        "Undergraduate admission requirements, tuition, deadlines and scholarships for international applicants",
      ],
    },
  });
  const started = Date.now();
  await runResearch(job.id);
  const seconds = Math.round((Date.now() - started) / 1000);
  const result = await db.researchJob.findUniqueOrThrow({
    where: { id: job.id },
    include: { candidates: true },
  });
  const usage = await db.modelUsage.findMany({ where: { jobId: job.id } });
  const input = usage.reduce((n, u) => n + u.inputTokens, 0);
  const output = usage.reduce((n, u) => n + u.outputTokens, 0);
  const cost = (input * PRICE.input + output * PRICE.output) / 1_000_000;
  const skipped = await db.researchLog.count({
    where: {
      jobId: job.id,
      message: { startsWith: "Skipped model extraction" },
    },
  });
  const summary = {
    date: new Date().toISOString(),
    universityId,
    model: [...new Set(usage.map((u) => u.model))].join(","),
    jobId: job.id,
    status: result.status,
    seconds,
    pagesFetched: result.pagesProcessed,
    pagesSkippedByGate: skipped,
    modelCalls: usage.length,
    inputTokens: input,
    outputTokens: output,
    costUsd: Number(cost.toFixed(4)),
    costPerCallUsd: usage.length ? Number((cost / usage.length).toFixed(4)) : 0,
    candidates: result.candidates.length,
    candidatesWithIssues: result.candidates.filter((c) => c.issues.length)
      .length,
    errors: result.errors.length,
  };
  console.log(JSON.stringify(summary, null, 2));
  appendFileSync(
    "docs/COST_LOG.md",
    "\n" +
      `- ${summary.date.slice(0, 10)} ${summary.model} ${universityId}: ` +
      `${summary.modelCalls} calls, ${input} in / ${output} out tokens, **$${summary.costUsd}** ` +
      `($${summary.costPerCallUsd}/call), ${summary.pagesFetched} pages, ` +
      `${skipped} gated, ${summary.candidates} candidates (${summary.candidatesWithIssues} flagged), ` +
      `${summary.errors} errors, ${seconds}s. Job ${job.id}.\n`,
  );
} finally {
  await db.$disconnect();
}
