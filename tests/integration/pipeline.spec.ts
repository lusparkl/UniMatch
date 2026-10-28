import { it, expect, vi } from "vitest";
import { Queue, Worker, QueueEvents } from "bullmq";
import { randomUUID } from "node:crypto";
import { db } from "../../lib/db";
import { redisConnection } from "../../lib/queue";
import { SafeFetcher } from "../../lib/research/security";
import { OpenAIProvider } from "../../lib/ai/openai";
import { runResearch } from "../../lib/research/pipeline";
import { processResearchJob } from "../../worker/processor";
import { reviewCandidate } from "../../lib/research/review";
import { extractionSchema } from "../../lib/research/extraction";
import { getPrograms } from "../../lib/catalog";
import { matchProgram } from "../../lib/matching";
import { defaultProfile } from "../../lib/domain";
it("local fixture → real BullMQ retry → extraction → PostgreSQL → review → changed matching", async () => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("OPENAI_API_KEY", "fixture-only-never-sent");
  vi.stubEnv("MAX_CRAWL_PAGES", "1");
  const id = "integration-" + randomUUID();
  const queueName = id;
  const connection = redisConnection(),
    queue = new Queue(queueName, { connection }),
    events = new QueueEvents(queueName, { connection: redisConnection() });
  await events.waitUntilReady();
  const u = await db.university.create({
    data: {
      id,
      name: "Integration Test University",
      country: "Germany",
      city: "Test",
      officialWebsite: "https://university.edu",
      sources: {
        create: {
          hostname: "university.edu",
          startUrl: "https://university.edu/program",
        },
      },
    },
  });
  const job = await db.researchJob.create({
    data: { universityId: u.id, targets: ["Computer Science"] },
  });
  const text = "Computer Science bachelor degree. IELTS 6.5 required.";
  const transport = vi.spyOn(SafeFetcher.prototype, "fetch").mockResolvedValue({
    url: "https://university.edu/program",
    body: Buffer.from(
      "<html><title>Computer Science</title><main><h1>Computer Science bachelor degree.</h1><p>IELTS 6.5 required.</p><p>This official test fixture describes the admissions requirements for international students.</p></main></html>",
    ),
    type: "text/html",
    status: 200,
  });
  const payload = extractionSchema.parse({
    program: {
      title: "Computer Science",
      degreeLevel: "BACHELOR",
      fieldOfStudy: "Computer Science",
      teachingLanguage: "English",
      duration: null,
      officialUrl: "https://university.edu/program",
      excerpt: "Computer Science bachelor degree.",
    },
    academicYear: null,
    requirements: [
      {
        type: "IELTS",
        label: "English requirement",
        minimum: 6.5,
        scale: null,
        allowed: [],
        mandatory: true,
        appliesToNationalities: [],
        appliesToQualifications: [],
        excerpt: "IELTS 6.5 required.",
      },
    ],
    intakes: [],
    costs: [],
    documents: [],
    scholarships: [],
    ambiguities: [],
  });
  // Test-only provider fixture. No network, no key, no claims of live AI.
  const model = vi
    .spyOn(OpenAIProvider.prototype, "extract")
    .mockResolvedValue(payload);
  let attempts = 0;
  const worker = new Worker(
    queueName,
    async (j) => {
      attempts++;
      if (attempts === 1) {
        await db.researchJob.update({
          where: { id: job.id },
          data: { status: "RETRYING" },
        });
        throw new Error("Recorded transient worker failure");
      }
      return processResearchJob(j);
    },
    { connection: redisConnection() },
  );
  try {
    const queued = await queue.add(
      "recorded-research",
      { researchJobId: job.id },
      { attempts: 2, backoff: { type: "fixed", delay: 100 } },
    );
    await queued.waitUntilFinished(events, 30000);
    expect(attempts).toBe(2);
    const candidate = await db.extractionCandidate.findFirstOrThrow({
      where: { jobId: job.id },
    });
    expect(candidate.status).toBe("NEEDS_REVIEW");
    expect(
      await db.degreeProgram.count({ where: { universityId: u.id } }),
    ).toBe(0);
    const invalid = structuredClone(payload);
    invalid.requirements[0].excerpt = "unsupported invented requirement";
    await expect(
      reviewCandidate(candidate.id, "APPROVE", "test-admin", invalid),
    ).rejects.toThrow("Excerpt");
    await reviewCandidate(candidate.id, "APPROVE", "test-admin", payload, true);
    const program = (await getPrograms()).find((p) => p.universityId === u.id)!;
    expect(program.requirements[0].evidence?.excerpt).toBe(
      "IELTS 6.5 required.",
    );
    expect(program.requirements[0].status).toBe("ADMIN_VERIFIED");
    expect(
      matchProgram(program, {
        ...defaultProfile,
        nationality: "Ukraine",
        educationCountry: "Ukraine",
        ielts: 5,
      }).academicState,
    ).toBe("FAIL");
    expect(
      matchProgram(program, {
        ...defaultProfile,
        nationality: "Ukraine",
        educationCountry: "Ukraine",
        ielts: 7,
      }).academicState,
    ).toBe("PASS");
    expect(
      await db.reviewRecord.count({ where: { candidateId: candidate.id } }),
    ).toBe(1);
    expect(text).toContain(program.requirements[0].evidence!.excerpt);
    await runResearch(job.id);
    expect(model).toHaveBeenCalledTimes(1);
    expect(
      await db.sourceDocument.count({ where: { universityId: u.id } }),
    ).toBe(1);
    const changed = structuredClone(payload);
    changed.requirements[0].minimum = 8;
    changed.requirements[0].excerpt = "IELTS 8.0 required.";
    model.mockResolvedValue(changed);
    transport.mockResolvedValue({
      url: "https://university.edu/program",
      type: "text/html",
      status: 200,
      body: Buffer.from(
        "<html><title>Updated source</title><main><p>Computer Science bachelor degree.</p><p>IELTS 8.0 required.</p><p>A changed official admission threshold for international applicants in this local test fixture.</p></main></html>",
      ),
    });
    await runResearch(job.id);
    const conflicting = await db.extractionCandidate.findFirstOrThrow({
      where: { jobId: job.id, reviewedAt: null },
    });
    expect(conflicting.status).toBe("CONFLICTING");
    const uncertain = (await getPrograms()).find(
      (p) => p.universityId === u.id,
    )!;
    expect(uncertain.requirements[0].minimum).toBe(6.5);
    expect(
      matchProgram(uncertain, {
        ...defaultProfile,
        nationality: "Ukraine",
        educationCountry: "Ukraine",
        ielts: 7,
      }).academicState,
    ).toBe("UNKNOWN");
    await reviewCandidate(conflicting.id, "REJECT", "test-admin");
    const restored = (await getPrograms()).find(
      (p) => p.universityId === u.id,
    )!;
    expect(restored.requirements[0].status).toBe("ADMIN_VERIFIED");
    expect(restored.requirements[0].minimum).toBe(6.5);
  } finally {
    await worker.close();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await connection.quit();
    await db.reviewRecord.deleteMany({
      where: { candidate: { jobId: job.id } },
    });
    await db.extractionCandidate.deleteMany({ where: { jobId: job.id } });
    await db.degreeProgram.deleteMany({ where: { universityId: u.id } });
    await db.sourceEvidence.deleteMany({
      where: { document: { universityId: u.id } },
    });
    await db.researchJob.delete({ where: { id: job.id } });
    await db.university.delete({ where: { id: u.id } });
    await db.$disconnect();
    vi.unstubAllEnvs();
  }
});
