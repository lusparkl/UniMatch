import { it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../lib/db";
import { SafeFetcher } from "../../lib/research/security";
import { OpenAIProvider } from "../../lib/ai/openai";
import { runResearch } from "../../lib/research/pipeline";
import { reviewCandidate } from "../../lib/research/review";
import { extractionSchema } from "../../lib/research/extraction";

const programUrl = "https://university.edu/programs/computer-science";
const feesUrl = "https://university.edu/admissions/fees";
const pages: Record<string, string> = {
  [programUrl]:
    "<html><title>BSc Computer Science</title><main><h1>BSc Computer Science</h1><p>Applicants with international qualifications apply by the application deadline. Priority round for 2027 entry closes on 25 November 2026. The programme lasts four years and is taught in English at the main campus.</p></main></html>",
  [feesUrl]:
    "<html><title>Fees</title><main><h1>Tuition fees</h1><p>Annual tuition fee for non-local students: HK$ 280,000 per academic year for all undergraduate programmes in STEM faculties. Living expenses are not included in this fee.</p></main></html>",
};
it("registered program: stored pages → one cited candidate → unchanged skip → approval keeps each page's evidence", async () => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("OPENAI_API_KEY", "fixture-only-never-sent");
  vi.stubEnv("MAX_CRAWL_PAGES", "5");
  const id = "program-" + randomUUID();
  const university = await db.university.create({
    data: {
      id,
      name: "Program Test University",
      country: "Hong Kong",
      city: "Test",
      officialWebsite: "https://university.edu",
      sources: {
        create: [programUrl, feesUrl].map((startUrl) => ({
          hostname: "university.edu",
          startUrl,
          purpose: "registry",
        })),
      },
      programs: {
        create: {
          title: "BSc Computer Science",
          degreeLevel: "BACHELOR",
          fieldOfStudy: "Computer Science",
          officialUrl: programUrl,
          published: true,
        },
      },
    },
  });
  try {
    vi.spyOn(SafeFetcher.prototype, "fetch").mockImplementation(
      async (raw) => ({
        url: raw,
        body: Buffer.from(pages[raw] ?? "<html></html>"),
        type: "text/html",
        status: 200,
      }),
    );
    const payload = extractionSchema.parse({
      program: {
        title: "BSc Computer Science",
        degreeLevel: "BACHELOR",
        fieldOfStudy: "Computer Science",
        teachingLanguage: "English",
        duration: "four years",
        officialUrl: programUrl,
        excerpt: "BSc Computer Science",
        sourceUrl: programUrl,
      },
      academicYear: null,
      requirements: [],
      intakes: [
        {
          academicYear: "2027",
          term: "Fall",
          route: "International qualifications",
          openDate: null,
          deadline: "2026-11-25T00:00:00+08:00",
          timezone: "Asia/Hong_Kong",
          excerpt: "Priority round for 2027 entry closes on 25 November 2026.",
          sourceUrl: programUrl,
        },
      ],
      costs: [
        {
          tuition: 280000,
          living: null,
          other: null,
          currency: "HKD",
          period: "ANNUAL",
          excerpt:
            "Annual tuition fee for non-local students: HK$ 280,000 per academic year",
          sourceUrl: feesUrl,
        },
      ],
      documents: [],
      scholarships: [],
      ambiguities: [],
    });
    const model = vi
      .spyOn(OpenAIProvider.prototype, "extractProgram")
      .mockResolvedValue(payload);
    const job = await db.researchJob.create({
      data: { universityId: university.id, targets: ["Computer Science"] },
    });
    await runResearch(job.id);
    expect(model).toHaveBeenCalledTimes(1);
    const call = model.mock.calls[0][0];
    expect(call.text).toContain("### SOURCE: " + feesUrl);
    expect(call.text).toContain("### SOURCE: " + programUrl);
    const candidate = await db.extractionCandidate.findFirstOrThrow({
      where: { jobId: job.id },
    });
    expect(candidate.programId).toBeTruthy();
    expect(candidate.bundleHash).toBeTruthy();
    expect(candidate.issues).toEqual([]);

    const second = await db.researchJob.create({
      data: { universityId: university.id, targets: ["Computer Science"] },
    });
    await runResearch(second.id);
    expect(model).toHaveBeenCalledTimes(1); // unchanged pages cost nothing

    await reviewCandidate(
      candidate.id,
      "APPROVE",
      "test-admin",
      payload,
      false,
    );
    const evidence = await db.sourceEvidence.findMany({
      where: { document: { universityId: university.id } },
    });
    expect(evidence.map((e) => e.url).sort()).toEqual(
      [feesUrl, programUrl].sort(),
    );
    expect(evidence.every((e) => e.startOffset !== null)).toBe(true);
  } finally {
    // Leave no published fixture program behind in the shared database.
    await db.reviewRecord.deleteMany({
      where: { candidate: { job: { universityId: id } } },
    });
    await db.extractionCandidate.deleteMany({
      where: { job: { universityId: id } },
    });
    await db.degreeProgram.deleteMany({ where: { universityId: id } });
    await db.sourceEvidence.deleteMany({
      where: { document: { universityId: id } },
    });
    await db.researchJob.deleteMany({ where: { universityId: id } });
    await db.university.delete({ where: { id } });
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
}, 60000);
