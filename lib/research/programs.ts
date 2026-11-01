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

const PROMPT_VERSION = "program-v20";
const INSTITUTION_VERSION = "institution-v3";

type Log = (message: string, level?: string) => Promise<void>;
type Payload = Awaited<ReturnType<OpenAIProvider["extractProgram"]>>;
type Doc = Awaited<ReturnType<typeof db.sourceDocument.findMany>>[number];

const claimsOf = (payload: Payload) => [
  ...(payload.program ? [payload.program] : []),
  ...payload.requirements,
  ...payload.intakes,
  ...payload.costs,
  ...payload.documents,
  ...payload.scholarships,
  ...payload.scholarships.flatMap((s) => s.rules),
];

/** Replaces near-miss quotations with the exact source passage they point at. */
function snapClaims(payload: Payload, sources: Map<string, string>) {
  for (const claim of claimsOf(payload)) {
    const own = claim.sourceUrl ? sources.get(claim.sourceUrl) : undefined;
    const haystack = own ?? [...sources.values()].join("\n");
    const snapped =
      snapExcerpt(claim.excerpt, haystack) ??
      salvageExcerpt(claim.excerpt, haystack);
    if (snapped && snapped.length >= 12) claim.excerpt = snapped;
  }
}

/**
 * Facts every bachelor's program shares (international admission, fees, scholarships), read once from
 * the university-wide registry pages and merged into each program's candidate. Reused while the pages are unchanged.
 */
async function institutionFacts(
  jobId: string,
  university: { id: string; name: string },
  shared: Doc[],
  provider: OpenAIProvider,
  log: Log,
  stage: (name: string) => Promise<void>,
) {
  const ranked = shared
    .map((doc) => ({ doc, score: doc.url.includes("?") ? 40 : 50 }))
    .sort((a, b) => b.score - a.score || a.doc.url.localeCompare(b.doc.url));
  const { text, sources, shed } = assembleBundle(
    ranked,
    new Set(shared.map((d) => d.url)),
    new Set(),
  );
  const hash = createHash("sha256")
    .update(
      INSTITUTION_VERSION +
        university.id +
        ranked
          .map((r) => r.doc.contentHash)
          .sort()
          .join(","),
    )
    .digest("hex");
  if (!ranked.length) return { hash, sources, payload: null };
  const cached = await db.extractionCandidate.findFirst({
    where: { programId: null, bundleHash: hash },
    orderBy: { createdAt: "desc" },
  });
  const parsed = cached && extractionSchema.safeParse(cached.payload);
  if (parsed?.success) {
    await log("Unchanged institution pages; reused institution-wide facts");
    return { hash, sources, payload: parsed.data };
  }
  for (const url of shed)
    await log("Left out of the model input (size): " + url, "WARN");
  await stage("Extracting institution-wide facts");
  const payload = await provider.extractProgram(
    {
      program: {
        title: "All first-year bachelor's programmes",
        degreeLevel: "BACHELOR",
        fieldOfStudy: "All fields",
        officialUrl: ranked[0].doc.url,
        university: university.name,
      },
      text,
    },
    true,
  );
  payload.program = null;
  snapClaims(payload, sources);
  // Model output varies between runs: keep earlier institution facts this run missed, re-checked below
  // against the current pages.
  const earlier = await db.extractionCandidate.findMany({
    where: {
      programId: null,
      bundleHash: { not: null },
      job: { universityId: university.id },
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
  if (merged) await log(`Merged ${merged} earlier institution-wide claims`);
  const pruned = [...dropUnquoted(payload, sources), ...pruneClaims(payload)];
  // Kept as a reviewed cache entry: its facts reach review inside each program's candidate.
  await db.extractionCandidate.create({
    data: {
      jobId,
      documentId: ranked[0].doc.id,
      bundleHash: hash,
      payload,
      status: "OUTDATED",
      reviewedAt: new Date(),
      issues: [
        "Institution-wide facts shared by every program; reviewed through each program's candidate",
        ...pruned.map((p) => "Pruned: " + p),
      ],
    },
  });
  await log("Extracted institution-wide facts");
  return { hash, sources, payload };
}

/** One model call per registered program over its own pages, plus the institution-wide facts. */
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
  const programUrls = new Set(university.programs.map((p) => p.officialUrl));
  const shared = documents.filter(
    (d) =>
      registryUrls.has(d.url) && !programUrls.has(d.url) && !scoped.has(d.url),
  );
  let institution;
  try {
    institution = await institutionFacts(
      jobId,
      university,
      shared,
      provider,
      log,
      stage,
    );
  } catch (error) {
    // Program candidates without the shared facts would look complete; stop instead.
    await log(String(error), "ERROR");
    if (error instanceof BudgetExceeded) throw error;
    return 0;
  }
  // A fee page that prices programs differently (by faculty, for example) cannot give every program one
  // tuition: each program call reads the page itself. Such pages are registered as "registry-fees";
  // shared pages whose extracted tuitions disagree are treated the same way.
  const tuition =
    institution.payload?.costs.filter(
      (c) => c.tuition !== null && c.period === "ANNUAL",
    ) ?? [];
  const conflicting =
    new Set(tuition.map((c) => c.currency + c.tuition)).size > 1
      ? shared.filter((d) => tuition.some((c) => c.sourceUrl === d.url))
      : [];
  const feePages = [
    ...documents.filter((d) => purposeOf.get(d.url) === "registry-fees"),
    ...conflicting,
  ];
  if (conflicting.length && institution.payload) {
    institution.payload.costs = institution.payload.costs.filter(
      (c) => !tuition.includes(c),
    );
    await log(
      "Tuition differs between programs; each program reads the fee page",
    );
  }
  let candidates = 0;
  for (const program of university.programs) {
    const { ranked: all, ownUrls } = rankPages(
      program,
      documents,
      registryUrls,
      scoped,
      university.programs.map((p) => p.officialUrl),
    );
    // The program's own and scoped pages; institution pages arrive through the shared facts.
    const ranked = [
      ...all.filter(
        (r) => r.doc.url === program.officialUrl || ownUrls.has(r.doc.url),
      ),
      ...feePages.map((doc) => ({ doc, score: 50 })),
    ];
    if (ranked.length === feePages.length) {
      await log("No stored page matches program: " + program.title, "WARN");
      continue;
    }
    // "<program pages>:<institution facts>": a change to the institution facts alone rebuilds the
    // candidate from the earlier program claims without a model call.
    const ownHash = createHash("sha256")
      .update(
        PROMPT_VERSION +
          program.id +
          ranked
            .map((r) => r.doc.contentHash)
            .sort()
            .join(","),
      )
      .digest("hex");
    const bundleHash = ownHash + ":" + institution.hash;
    const previous = await db.extractionCandidate.findFirst({
      where: { programId: program.id, bundleHash: { startsWith: ownHash } },
      orderBy: { createdAt: "desc" },
    });
    if (previous?.bundleHash === bundleHash) {
      await log("Unchanged sources; skipped model call: " + program.title);
      continue;
    }
    const reused = previous && extractionSchema.safeParse(previous.payload);
    const {
      text,
      sources: ownSources,
      shed,
    } = assembleBundle(ranked, registryUrls, ownUrls);
    for (const url of shed)
      await log("Left out of the model input (size): " + url, "WARN");
    // Pages read only through the institution facts; their claims are never reused from older candidates.
    const institutionUrls = new Set(
      shared.filter((d) => !feePages.includes(d)).map((d) => d.url),
    );
    const ownClaim = (c: { sourceUrl: string | null }) =>
      !c.sourceUrl || !institutionUrls.has(c.sourceUrl);
    await stage("Extracting " + program.title);
    try {
      const payload = reused?.success
        ? {
            ...reused.data,
            requirements: reused.data.requirements.filter(ownClaim),
            intakes: reused.data.intakes.filter(ownClaim),
            costs: reused.data.costs.filter(ownClaim),
            documents: reused.data.documents.filter(ownClaim),
            scholarships: reused.data.scholarships.filter(ownClaim),
          }
        : await provider.extractProgram({
            program: {
              title: program.title,
              degreeLevel: program.degreeLevel,
              fieldOfStudy: program.fieldOfStudy,
              officialUrl: program.officialUrl,
              university: university.name,
            },
            text,
          });
      if (reused?.success)
        await log(
          "Unchanged program pages; rebuilt with current institution facts: " +
            program.title,
        );
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
      snapClaims(payload, ownSources);
      const sources = new Map([...institution.sources, ...ownSources]);
      if (institution.payload) {
        const added = mergeClaims(payload, [
          structuredClone(institution.payload),
        ]);
        await log(`Added ${added} institution-wide facts: ${program.title}`);
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
      // Claims citing shared pages come from this run's institution facts or fee pages, never from older runs.
      const sharedUrls = new Set([...shared, ...feePages].map((d) => d.url));
      const fresh = (c: { sourceUrl: string | null }) =>
        !c.sourceUrl || !sharedUrls.has(c.sourceUrl);
      const merged = mergeClaims(
        payload,
        earlier.flatMap((c) => {
          const parsed = extractionSchema.safeParse(c.payload);
          if (!parsed.success) return [];
          const p = parsed.data;
          return [
            {
              requirements: p.requirements.filter(fresh),
              intakes: p.intakes.filter(fresh),
              costs: p.costs.filter(fresh),
              documents: p.documents.filter(fresh),
              scholarships: p.scholarships.filter(fresh),
            },
          ];
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
      for (const doc of [...ranked.map((r) => r.doc), ...shared])
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
