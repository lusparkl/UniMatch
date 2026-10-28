import { db } from "../db";
import { OpenAIProvider, BudgetExceeded } from "../ai/openai";
import { crawlSources } from "./crawler";
import { allowedUrl } from "./security";
import {
  extractionSchema,
  conflictingRules,
  contradictoryValues,
  validateEvidence,
} from "./extraction";
import { limits } from "../config";
export async function runResearch(jobId: string) {
  const job = await db.researchJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { university: { include: { sources: true } } },
  });
  const log = async (message: string, level = "INFO") => {
    await db.researchLog.create({ data: { jobId, message, level } });
  };
  const stage = async (stage: string) => {
    await db.researchJob.update({ where: { id: jobId }, data: { stage } });
  };
  if (!process.env.OPENAI_API_KEY)
    throw new Error(
      "Live research is disabled: OPENAI_API_KEY is missing. Demo fixtures are separate.",
    );
  if (!job.university.sources.length)
    throw new Error("No administrator-approved research sources");
  await db.researchJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", stage: "Discovering", startedAt: new Date() },
  });
  await log("Approved research targets: " + job.targets.join(", "));
  const provider = new OpenAIProvider(jobId);
  let candidates = 0;
  await stage("Crawling");
  await crawlSources(
    job.university.sources,
    async (d) => {
      const existing = await db.sourceDocument.findUnique({
        where: {
          universityId_url_contentHash: {
            universityId: job.universityId,
            url: d.url,
            contentHash: d.contentHash,
          },
        },
      });
      if (existing?.extractedAt) {
        await db.sourceDocument.update({
          where: { id: existing.id },
          data: { lastCheckedAt: new Date() },
        }); // Restore only stale facts backed by unchanged bytes; keep original human verification date.
        const ev = await db.sourceEvidence.findMany({
          where: { documentId: existing.id, verificationStatus: "OUTDATED" },
        });
        for (const e of ev) {
          const restored = e.verifiedAt ? "ADMIN_VERIFIED" : "SOURCE_BACKED";
          await db.sourceEvidence.update({
            where: { id: e.id },
            data: { verificationStatus: restored },
          });
          await db.admissionRequirement.updateMany({
            where: { sourceEvidenceId: e.id, verificationStatus: "OUTDATED" },
            data: { verificationStatus: restored },
          });
          await db.costEstimate.updateMany({
            where: { sourceEvidenceId: e.id, verificationStatus: "OUTDATED" },
            data: { verificationStatus: restored },
          });
          await db.applicationIntake.updateMany({
            where: { sourceEvidenceId: e.id, verificationStatus: "OUTDATED" },
            data: { verificationStatus: restored },
          });
          await db.scholarship.updateMany({
            where: { sourceEvidenceId: e.id, verificationStatus: "OUTDATED" },
            data: { verificationStatus: restored },
          });
        }
        await log("Unchanged; skipped model extraction: " + d.url);
        return;
      }
      const previous = await db.sourceDocument.findFirst({
        where: { universityId: job.universityId, url: d.url },
        orderBy: { retrievedAt: "desc" },
      });
      const doc =
        existing ??
        (await db.sourceDocument.create({
          data: {
            ...d,
            universityId: job.universityId,
            previousVersionId: previous?.id,
          },
        }));
      await db.researchJob.update({
        where: { id: jobId },
        data: { pagesProcessed: { increment: 1 } },
      });
      const calls = await db.researchJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      if (calls.modelCalls >= limits().calls) {
        await log(
          "Saved source without extraction: per-job call limit reached",
          "WARN",
        );
        return;
      }
      await stage("Extracting");
      // Bounded relevant windows retain contiguous quotations and do not send whole sites.
      const lines = d.text.split("\n");
      const selected = new Set<number>();
      lines.forEach((line, i) => {
        if (
          /admission|require|IELTS|TOEFL|tuition|scholarship|deadline|bachelor|master|computer|engineering|funding/i.test(
            line,
          )
        )
          for (
            let j = Math.max(0, i - 1);
            j <= Math.min(lines.length - 1, i + 2);
            j++
          )
            selected.add(j);
      });
      const text = (
        [...selected]
          .sort((a, b) => a - b)
          .map((i) => lines[i])
          .join("\n") || d.text
      ).slice(0, 18000);
      try {
        const payload = await provider.extract({
          url: d.url,
          text,
          target: job.targets.join(", "),
        });
        await stage("Validating");
        const issues = validateEvidence(payload, d.text, (url) =>
          allowedUrl(url, job.university.sources),
        );
        const program = payload.program
          ? await db.degreeProgram.findFirst({
              where: {
                universityId: job.universityId,
                title: payload.program.title,
                degreeLevel: payload.program.degreeLevel,
              },
              include: { requirements: true, costs: true, intakes: true },
            })
          : null;
        const ruleConflict =
          program &&
          conflictingRules(
            program.requirements.map((r) => r.conditions),
            payload.requirements,
          );
        const costConflict = program?.costs.some((old) =>
          payload.costs.some(
            (c) =>
              old.currency === c.currency &&
              old.period === c.period &&
              contradictoryValues(
                {
                  tuition: old.tuitionAmount,
                  living: old.livingCostAmount,
                  other: old.additionalCosts,
                },
                c,
                ["tuition", "living", "other"],
              ),
          ),
        );
        const intakeConflict = program?.intakes.some((old) =>
          payload.intakes.some(
            (i) =>
              old.academicYear === i.academicYear &&
              old.intakeTerm === i.term &&
              old.applicationRoute === i.route &&
              contradictoryValues(
                { deadline: old.deadline?.toISOString() ?? null },
                {
                  deadline: i.deadline
                    ? new Date(i.deadline).toISOString()
                    : null,
                },
                ["deadline"],
              ),
          ),
        );
        const pending = await db.extractionCandidate.findMany({
          where: { job: { universityId: job.universityId }, reviewedAt: null },
        });
        const otherConflicts = pending.filter((c) => {
          const older = extractionSchema.safeParse(c.payload);
          return (
            older.success &&
            older.data.program?.title === payload.program?.title &&
            payload.program &&
            conflictingRules(older.data.requirements, payload.requirements)
          );
        });
        const conflict = !!(
          ruleConflict ||
          costConflict ||
          intakeConflict ||
          otherConflicts.length
        );
        for (const older of otherConflicts)
          await db.extractionCandidate.update({
            where: { id: older.id },
            data: {
              status: "CONFLICTING",
              issues: { push: "Another source contradicts these requirements" },
            },
          });
        if (program && costConflict)
          await db.costEstimate.updateMany({
            where: { programId: program.id },
            data: { verificationStatus: "CONFLICTING" },
          });
        if (program && intakeConflict)
          await db.applicationIntake.updateMany({
            where: { programId: program.id },
            data: { verificationStatus: "CONFLICTING" },
          });
        if (conflict) {
          issues.push(
            "Conflicting published requirement; existing values preserved and excluded from definitive matching pending review",
          );
          if (program && ruleConflict)
            await db.admissionRequirement.updateMany({
              where: {
                programId: program.id,
                requirementType: {
                  in: payload.requirements.map((r) => r.type),
                },
              },
              data: { verificationStatus: "CONFLICTING" },
            });
        }
        // All changed financial/deadline facts are reviewed; no automatic replacement.
        await db.extractionCandidate.create({
          data: {
            jobId,
            documentId: doc.id,
            payload,
            status: conflict ? "CONFLICTING" : "NEEDS_REVIEW",
            issues,
          },
        });
        await db.sourceDocument.update({
          where: { id: doc.id },
          data: { extractedAt: new Date() },
        });
        candidates++;
        await log(
          "Extracted candidate for review: " +
            (payload.program?.title ?? "Institution-wide scholarships"),
        );
      } catch (error) {
        await log(String(error), "ERROR");
        if (error instanceof BudgetExceeded) throw error;
      }
      await stage("Crawling");
    },
    async (message) => {
      await log(message, message.startsWith("FAILED") ? "ERROR" : "INFO");
    },
  );
  const errors = await db.researchLog.findMany({
    where: { jobId, level: "ERROR" },
  });
  await db.researchJob.update({
    where: { id: jobId },
    data: {
      status: candidates
        ? "REVIEW_NEEDED"
        : errors.length
          ? "FAILED"
          : "COMPLETED",
      stage: candidates
        ? "Review needed"
        : errors.length
          ? "Failed"
          : "Completed",
      completedAt: new Date(),
      errors: errors.map((e) => e.message),
    },
  });
  await db.university.update({
    where: { id: job.universityId },
    data: {
      researchStatus: candidates
        ? "REVIEW_NEEDED"
        : errors.length
          ? "FAILED"
          : "RESEARCHED",
    },
  });
}
