import { createHash } from "node:crypto";
import { db } from "../db";
import { OpenAIProvider, BudgetExceeded } from "../ai/openai";
import { limits } from "../config";
import { allowedUrl } from "./security";
import { extractionSchema, validateEvidence } from "./extraction";
import {
  assembleBundle,
  isRegistry,
  mergeClaims,
  rankPages,
  registryScope,
  dropUnquoted,
  programTitleIssues,
  pruneClaims,
  widenExcerpt,
  snapExcerpt,
  institutionTeachingLanguage,
  salvageExcerpt,
} from "./relevance";

const PROMPT_VERSION = "program-v19";

type Log = (message: string, level?: string) => Promise<void>;

/** One model call per registered program, over the best-matching stored official pages. */
export async function extractRegisteredPrograms(
  jobId: string,
  universityId: string,
  provider: OpenAIProvider,
  log: Log,
  stage: (name: string) => Promise<void>,
) {
  const university = await db.university.findUniqueOrThrow({
    where: { id: universityId },
    include: { sources: true, programs: { where: { published: true } } },
  });
  // Latest stored version of every page.
  const stored = await db.sourceDocument.findMany({
    where: { universityId },
    orderBy: { retrievedAt: "desc" },
  });
  const latest = new Map<string, (typeof stored)[number]>();
  for (const d of stored) if (!latest.has(d.url)) latest.set(d.url, d);
  const documents = [...latest.values()];
  const registryUrls = new Set(
    university.sources
      .filter((s) => s.purpose === "registry")
      .map((s) => s.startUrl),
  );
  // Pages registered for one program only: url -> program title.
  const scoped = new Map(
    university.sources
      .filter((s) => isRegistry(s.purpose) && registryScope(s.purpose))
      .map((s) => [s.startUrl, registryScope(s.purpose)!]),
  );
  const purposeOf = new Map(
    university.sources.map((s) => [s.startUrl, s.purpose]),
  );
  let candidates = 0;
  for (const program of university.programs) {
    const { ranked, ownUrls } = rankPages(
      program,
      documents,
      registryUrls,
      scoped,
      university.programs.map((p) => p.officialUrl),
    );
    if (!ranked.length) {
      await log("No stored page matches program: " + program.title, "WARN");
      continue;
    }
    const bundleHash = createHash("sha256")
      .update(
        PROMPT_VERSION +
          program.id +
          ranked
            .map((r) => r.doc.contentHash)
            .sort()
            .join(","),
      )
      .digest("hex");
    const already = await db.extractionCandidate.findFirst({
      where: { programId: program.id, bundleHash },
    });
    if (already) {
      await log("Unchanged sources; skipped model call: " + program.title);
      continue;
    }
    const { text, sources, shed } = assembleBundle(
      ranked,
      registryUrls,
      ownUrls,
    );
    for (const url of shed)
      await log("Left out of the model input (size): " + url, "WARN");
    await stage("Extracting " + program.title);
    try {
      const payload = await provider.extractProgram({
        program: {
          title: program.title,
          degreeLevel: program.degreeLevel,
          fieldOfStudy: program.fieldOfStudy,
          officialUrl: program.officialUrl,
          university: university.name,
        },
        text,
      });
      if (payload.program) {
        // A model sometimes writes the word "null" instead of leaving a field empty.
        for (const key of ["teachingLanguage", "duration"] as const)
          if (
            /^\s*(null|none|n\/a|unknown)?\s*$/i.test(
              payload.program[key] ?? "x",
            )
          )
            payload.program[key] = null;
        payload.program.title = program.title;
        payload.program.degreeLevel = program.degreeLevel;
        payload.program.officialUrl = program.officialUrl;
      }
      // Replace near-miss quotations with the exact source passage they point at.
      const claims = [
        ...(payload.program ? [payload.program] : []),
        ...payload.requirements,
        ...payload.intakes,
        ...payload.costs,
        ...payload.documents,
        ...payload.scholarships,
        ...payload.scholarships.flatMap((s) => s.rules),
      ];
      for (const claim of claims) {
        const own = claim.sourceUrl ? sources.get(claim.sourceUrl) : undefined;
        const haystack = own ?? [...sources.values()].join("\n");
        const snapped =
          snapExcerpt(claim.excerpt, haystack) ??
          salvageExcerpt(claim.excerpt, haystack);
        if (snapped && snapped.length >= 12) claim.excerpt = snapped;
      }
      // Fold in claims from recent runs that this run missed; they must still be quoted on the current pages.
      const earlier = await db.extractionCandidate.findMany({
        where: {
          programId: program.id,
          status: { in: ["NEEDS_REVIEW", "OUTDATED"] },
          createdAt: { gte: new Date(Date.now() - 14 * 24 * 3600 * 1000) },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      const merged = mergeClaims(
        payload,
        earlier.flatMap((c) => {
          const parsed = extractionSchema.safeParse(c.payload);
          return parsed.success ? [parsed.data] : [];
        }),
      );
      if (merged)
        await log(`Merged ${merged} earlier claims: ${program.title}`);
      // An entry year often sits in a page header beside the dates; widen the quote to include it.
      for (const intake of payload.intakes) {
        const own = intake.sourceUrl
          ? sources.get(intake.sourceUrl)
          : undefined;
        const needles = [
          intake.academicYear,
          ...[intake.openDate, intake.deadline]
            .filter((v): v is string => v !== null)
            .map((v) => v.slice(0, 4)),
        ];
        const widened = own && widenExcerpt(intake.excerpt, own, needles);
        if (widened) intake.excerpt = widened;
      }
      // Drop values the quoted text does not back up; keep a note so reviewers see what was removed.
      const pruned = [
        ...dropUnquoted(payload, sources),
        ...pruneClaims(payload),
      ];
      // Dedupe identical cost and intake entries (merged runs repeat them).
      const once = <T>(list: T[]) => [
        ...new Map(
          list.map((v) => [
            JSON.stringify(v, (k, x) =>
              k === "excerpt" || k === "sourceUrl" ? undefined : x,
            ),
            v,
          ]),
        ).values(),
      ];
      payload.costs = once(payload.costs);
      payload.intakes = once(payload.intakes);
      const language =
        payload.program && !payload.program.teachingLanguage
          ? institutionTeachingLanguage(
              // Any registered page may carry the statement, including pages left out of the model input.
              new Map(
                documents
                  .filter((d) => isRegistry(purposeOf.get(d.url) ?? ""))
                  .map((d) => [d.url, d.text]),
              ),
            )
          : null;
      if (payload.program && language)
        payload.program.teachingLanguage = language.language;
      const issues = validateEvidence(payload, sources, (url) =>
        allowedUrl(url, university.sources),
      );
      issues.push(...pruned.map((p) => "Pruned: " + p));
      if (language)
        issues.push(
          `Teaching language "${language.language}" comes from an institution-wide statement, not a program page: "${language.sentence}" (${language.url})`,
        );
      if (payload.program)
        issues.push(
          ...programTitleIssues(
            payload.program.title,
            [...sources.values()].join("\n"),
          ).filter((i) => i.includes("does not appear")),
        );
      const facts =
        payload.requirements.length +
        payload.intakes.length +
        payload.costs.length +
        payload.documents.length +
        payload.scholarships.length;
      if (!facts) {
        await log("No facts found for program: " + program.title);
        continue;
      }
      // Older unreviewed candidates for this program are replaced by the newest extraction.
      await db.extractionCandidate.updateMany({
        where: { programId: program.id, reviewedAt: null },
        data: { status: "OUTDATED", reviewedAt: new Date() },
      });
      await db.extractionCandidate.create({
        data: {
          jobId,
          documentId: ranked[0].doc.id,
          programId: program.id,
          bundleHash,
          payload,
          status: "NEEDS_REVIEW",
          issues,
        },
      });
      for (const { doc } of ranked)
        await db.sourceDocument.update({
          where: { id: doc.id },
          data: { extractedAt: new Date() },
        });
      candidates++;
      await log(
        "Extracted candidate for review: " +
          program.title +
          " (" +
          facts +
          " facts)",
      );
    } catch (error) {
      await log(String(error), "ERROR");
      if (error instanceof BudgetExceeded) throw error;
    }
    if (
      (await db.researchJob.findUniqueOrThrow({ where: { id: jobId } }))
        .modelCalls >= limits().calls
    ) {
      await log("Per-job call limit reached", "WARN");
      break;
    }
  }
  return candidates;
}
