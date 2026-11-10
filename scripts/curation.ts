import { db } from "../lib/db";
import { crawlSources } from "../lib/research/crawler";
import type { Extraction } from "../lib/research/extraction";
// Shared helpers for reviewer curation scripts: pages come through the guarded crawler (approved hosts,
// robots.txt, delay, SSRF checks), quotations are cut verbatim from the stored text, and every written row
// carries SourceEvidence plus a ReviewRecord on its own reviewed candidate.
export const squash = (value: string) =>
  value.replace(/[\s  -​ 　]+/g, " ").trim();

/** Quotes the shortest run of the page that starts with `start` and ends with `end`. */
export function quoter(url: string, text: string) {
  const page = squash(text);
  return (start: string, end = start) => {
    const startAt = page.indexOf(squash(start));
    if (startAt < 0) throw new Error(`"${start}" not found in ${url}`);
    const endAt = page.indexOf(squash(end), startAt);
    if (endAt < 0)
      throw new Error(`"${end}" not found after "${start}" in ${url}`);
    const excerpt = page.slice(startAt, endAt + squash(end).length);
    if (excerpt.length > 1200)
      throw new Error(`Excerpt over 1200 characters in ${url}`);
    return { excerpt, sourceUrl: url };
  };
}

export const latestDocument = (universityId: string, url: string) =>
  db.sourceDocument.findFirst({
    where: { universityId, url },
    orderBy: { retrievedAt: "desc" },
  });

/** Fetches one approved page through the guarded crawler and stores it as a new version when it changed. */
export async function fetchApproved(universityId: string, url: string) {
  const source = await db.approvedSource.findUnique({
    where: { universityId_startUrl: { universityId, startUrl: url } },
  });
  if (!source) throw new Error("Not an approved source: " + url);
  let fetched: Parameters<Parameters<typeof crawlSources>[1]>[0] | undefined;
  const messages: string[] = [];
  await crawlSources(
    [source],
    async (d) => {
      fetched ??= d;
    },
    async (message) => {
      messages.push(message);
    },
    0,
  ).catch((error) => messages.push(String(error)));
  if (!fetched)
    throw new Error("Nothing retrieved: " + url + " " + messages.join("; "));
  const before = await latestDocument(universityId, fetched.url);
  if (before?.contentHash === fetched.contentHash)
    return db.sourceDocument.update({
      where: { id: before.id },
      data: { lastCheckedAt: new Date() },
    });
  return db.sourceDocument.create({
    data: { ...fetched, universityId, previousVersionId: before?.id },
  });
}

export const curationJob = (universityId: string, target: string) =>
  db.researchJob.create({
    data: {
      universityId,
      targets: ["Reviewer curation: " + target],
      stage: "Reviewed",
      status: "COMPLETED",
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

type Page = Awaited<ReturnType<typeof fetchApproved>>;
type Cost = Extraction["costs"][number];
/**
 * Adds one SOURCE_BACKED cost row (one or more parts) to a programme, with its evidence, a reviewed candidate
 * holding the claim, and a ReviewRecord. `superseded` rows are deleted in the same transaction and kept in the record.
 */
export async function addCost(input: {
  jobId: string;
  programId: string;
  universityId: string;
  page: Page;
  cost: Cost;
  academicYear: string | null;
  estimateType: string;
  reviewer: string;
  action: string;
  note: string;
  superseded?: { id: string }[];
}) {
  const { page, cost } = input;
  if (squash(page.text).indexOf(cost.excerpt) < 0)
    throw new Error("Excerpt not on page: " + cost.excerpt.slice(0, 60));
  return db.$transaction(async (tx) => {
    const old = input.superseded?.length
      ? await tx.costEstimate.findMany({
          where: { id: { in: input.superseded.map((s) => s.id) } },
          include: { evidence: true },
        })
      : [];
    if (old.length)
      await tx.costEstimate.deleteMany({
        where: { id: { in: old.map((o) => o.id) } },
      });
    const evidence = await tx.sourceEvidence.create({
      data: {
        documentId: page.id,
        url: page.url,
        title: page.title,
        excerpt: cost.excerpt,
        startOffset:
          page.text.indexOf(cost.excerpt) >= 0
            ? page.text.indexOf(cost.excerpt)
            : null,
        retrievedAt: page.retrievedAt,
        contentHash: page.contentHash,
        relevantAcademicYear: input.academicYear,
        verificationStatus: "SOURCE_BACKED",
      },
    });
    const row = await tx.costEstimate.create({
      data: {
        universityId: input.universityId,
        programId: input.programId,
        tuitionAmount: cost.tuition,
        livingCostAmount: cost.living,
        additionalCosts: cost.other,
        currency: cost.currency,
        period: cost.period,
        estimateType: input.estimateType,
        verificationStatus: "SOURCE_BACKED",
        sourceEvidenceId: evidence.id,
      },
    });
    const candidate = await tx.extractionCandidate.create({
      data: {
        jobId: input.jobId,
        documentId: page.id,
        programId: input.programId,
        payload: {
          program: null,
          academicYear: input.academicYear,
          requirements: [],
          intakes: [],
          costs: [cost],
          documents: [],
          scholarships: [],
          ambiguities: [],
        },
        status: "SOURCE_BACKED",
        reviewedAt: new Date(),
        issues: [input.note],
      },
    });
    await tx.reviewRecord.create({
      data: {
        candidateId: candidate.id,
        action: input.action,
        previousValue: JSON.parse(
          JSON.stringify({
            superseded: old.map((o) => ({
              ...o,
              evidence: { url: o.evidence.url, excerpt: o.evidence.excerpt },
            })),
          }),
        ),
        revisedValue: { costId: row.id, ...cost, note: input.note },
        administratorIdentity: input.reviewer,
      },
    });
    return row;
  });
}
