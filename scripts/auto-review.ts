import { db } from "../lib/db";
import { enabledCountries, limits } from "../lib/config";
import { curate } from "../lib/research/curate";
import { extractionSchema } from "../lib/research/extraction";
import { effectiveStatus } from "../lib/research/freshness";
import { reviewCandidate } from "../lib/research/review";
import {
  AUTO_REVIEWER,
  autoReview,
  completeness,
  costKey,
  intakeKey,
  ruleScope,
  type Published,
} from "../lib/research/auto-review";
import { ruleSchema, type Verification } from "../lib/domain";
// Automated review (hackathon plan 3.1–3.4). Dry run by default; APPLY=1 writes. Publishes SOURCE_BACKED
// only, never replaces a human-reviewed row, and never sets ADMIN_VERIFIED. Idempotent: reviewed
// candidates are skipped and requirementsComplete is only ever set, never cleared.
// UNIVERSITIES=hku,cuhk limits the run; the default is every registry university in ENABLED_COUNTRIES.
if (process.env.OWNER_APPROVED)
  throw new Error(
    "auto-review never records owner approval; use the owner's own confirmation script",
  );
const apply = process.env.APPLY === "1";
const byteCap = limits().bytes;
const count = new Map<string, number>();
const tally = (key: string, n = 1) => count.set(key, (count.get(key) ?? 0) + n);
const shape = (reason: string) =>
  reason.replace(/https?:\/\/\S+/g, "<url>").replace(/\d[\d.,]*/g, "N");

async function loadProgram(id: string) {
  return db.degreeProgram.findUnique({
    where: { id },
    include: {
      requirements: { include: { evidence: { include: { document: true } } } },
      intakes: { include: { evidence: { include: { document: true } } } },
      costs: { include: { evidence: { include: { document: true } } } },
      scholarships: { include: { scholarship: true } },
    },
  });
}
type Loaded = NonNullable<Awaited<ReturnType<typeof loadProgram>>>;

function publishedOf(p: Loaded): Published {
  return {
    requirements: p.requirements.map((r) => {
      const rule = ruleSchema.safeParse(r.conditions);
      return {
        id: r.id,
        type: r.requirementType,
        label: rule.success ? rule.data.label : "",
        minimum: rule.success ? rule.data.minimum : null,
        scope: ruleScope({
          appliesToQualifications: r.applicableQualifications,
          appliesToNationalities: r.applicableNationalities,
        }),
        status: r.verificationStatus,
      };
    }),
    intakes: p.intakes.map((i) => ({
      id: i.id,
      key: intakeKey({
        academicYear: i.academicYear,
        term: i.intakeTerm,
        route: i.applicationRoute,
      }),
      deadline: i.deadline?.toISOString() ?? null,
      status: i.verificationStatus,
    })),
    costs: p.costs.map((c) => ({
      id: c.id,
      key: costKey(c),
      tuition: c.tuitionAmount,
      living: c.livingCostAmount,
      other: c.additionalCosts,
      status: c.verificationStatus,
    })),
    scholarships: p.scholarships.map(({ scholarship: s }) => ({
      id: s.id,
      name: s.name,
      tuitionCoverage: s.tuitionCoverage,
      stipendAmount: s.stipendAmount,
      status: s.verificationStatus,
    })),
    teachingLanguage: p.teachingLanguage,
    duration: p.duration,
  };
}

// Checklist 3.2 over what students would see: read-time freshness applied, cited pages as stored.
async function checklist(p: Loaded) {
  const urls = [...new Set(p.requirements.map((r) => r.evidence.url))];
  const pages = await Promise.all(
    urls.map(async (url) => ({
      url,
      text:
        (
          await db.sourceDocument.findFirst({
            where: { universityId: p.universityId, url },
            orderBy: { retrievedAt: "desc" },
          })
        )?.text ?? null,
    })),
  );
  const fresh = (status: Verification, checked: Date, kind?: "deadline") =>
    effectiveStatus(status, checked, kind);
  return completeness({
    degreeLevel: p.degreeLevel,
    rules: p.requirements.flatMap((r) => {
      const rule = ruleSchema.safeParse(r.conditions);
      return rule.success
        ? [
            {
              ...rule.data,
              excerpt: r.evidence.excerpt,
              status: fresh(
                r.verificationStatus,
                r.evidence.document.lastCheckedAt,
              ),
            },
          ]
        : [];
    }),
    statuses: [
      ...p.requirements.map((r) =>
        fresh(r.verificationStatus, r.evidence.document.lastCheckedAt),
      ),
      ...p.costs.map((c) =>
        fresh(c.verificationStatus, c.evidence.document.lastCheckedAt),
      ),
      ...p.intakes.flatMap((i) =>
        i.evidence
          ? [
              fresh(
                i.verificationStatus,
                i.evidence.document.lastCheckedAt,
                "deadline",
              ),
            ]
          : [],
      ),
    ],
    pages,
    byteCap,
  });
}

try {
  const universities = process.env.UNIVERSITIES
    ? process.env.UNIVERSITIES.split(",")
    : (
        await db.university.findMany({
          where: {
            country: { in: enabledCountries() },
            sources: { some: { purpose: { startsWith: "registry" } } },
          },
          select: { id: true },
        })
      ).map((u) => u.id);
  for (const universityId of universities) {
    const university = await db.university.findUniqueOrThrow({
      where: { id: universityId },
      include: { sources: true },
    });
    const registered = new Set(
      university.sources
        .filter((s) => s.purpose.startsWith("registry"))
        .map((s) => s.startUrl),
    );
    const stored = await db.sourceDocument.findMany({
      where: { universityId },
      orderBy: { retrievedAt: "desc" },
    });
    const pages = new Map<string, string>();
    for (const d of stored)
      if (registered.has(d.url) && !pages.has(d.url)) pages.set(d.url, d.text);
    const candidates = await db.extractionCandidate.findMany({
      where: {
        programId: { not: null },
        job: { universityId },
        status: "NEEDS_REVIEW",
        reviewedAt: null,
      },
      orderBy: { createdAt: "desc" },
      include: { document: true },
    });
    const seen = new Set<string>();
    for (const c of candidates) {
      // The newest candidate per programme already folds in recent claims (mergeClaims).
      if (seen.has(c.programId!)) continue;
      seen.add(c.programId!);
      tally("candidates");
      const parsed = extractionSchema.safeParse(c.payload);
      const program = await loadProgram(c.programId!);
      if (!parsed.success || !program) {
        tally("skipped: unparsable payload or programme missing");
        continue;
      }
      const own = new Map(pages);
      if (!own.has(c.document.url)) own.set(c.document.url, c.document.text);
      const curated = curate(parsed.data, own);
      const result = autoReview(curated.payload, {
        pages: own,
        fallbackUrl: c.document.url,
        sources: university.sources,
        issues: c.issues,
        published: publishedOf(program),
      });
      tally("claims approved", result.approved);
      tally("claims left out by curation", curated.dropped.length);
      for (const r of result.rejected)
        tally("rejected (" + r.kind + "): " + shape(r.reason));
      tally("conflicts marked", result.conflicts.length);
      console.log(
        `\n${universityId} | ${program.title} | approve ${result.approved}, reject ${result.rejected.length}, conflict ${result.conflicts.length}`,
      );
      if (process.env.VERBOSE === "1") {
        for (const r of result.rejected)
          console.log(`   - ${r.kind} "${r.label.slice(0, 60)}": ${r.reason}`);
        for (const n of result.notes) console.log("   note:", n);
      }
      for (const k of result.conflicts)
        console.log(`   CONFLICT ${k.kind} ${k.id}: ${k.reason}`);
      if (!apply) continue;
      if (result.approved) {
        try {
          await reviewCandidate(
            c.id,
            "APPROVE",
            AUTO_REVIEWER,
            result.payload,
            false,
            {
              status: "SOURCE_BACKED",
            },
          );
          tally("candidates approved");
        } catch (error) {
          tally(
            "candidates not approved: " + shape(String(error)).slice(0, 120),
          );
          console.log("   NOT APPROVED:", String(error).slice(0, 300));
          continue;
        }
      }
      // Only machine-reviewed rows are ever demoted; a human-reviewed row is never touched.
      const demote = { verificationStatus: "CONFLICTING" as const };
      const only = (kind: string) =>
        result.conflicts.filter((k) => k.kind === kind).map((k) => k.id);
      await db.admissionRequirement.updateMany({
        where: {
          id: { in: only("requirement") },
          verificationStatus: "SOURCE_BACKED",
        },
        data: demote,
      });
      await db.applicationIntake.updateMany({
        where: {
          id: { in: only("intake") },
          verificationStatus: "SOURCE_BACKED",
        },
        data: demote,
      });
      await db.costEstimate.updateMany({
        where: {
          id: { in: only("cost") },
          verificationStatus: "SOURCE_BACKED",
        },
        data: demote,
      });
      await db.scholarship.updateMany({
        where: {
          id: { in: only("scholarship") },
          verificationStatus: "SOURCE_BACKED",
        },
        data: demote,
      });
      if (result.conflicts.length)
        await db.reviewRecord.create({
          data: {
            candidateId: c.id,
            action: "AUTO_CONFLICT",
            previousValue: { conflicts: result.conflicts },
            revisedValue: { status: "CONFLICTING" },
            administratorIdentity: AUTO_REVIEWER,
          },
        });
    }

    // Checklist 3.2 for every published programme of the university, candidate or not.
    const programs = await db.degreeProgram.findMany({
      where: { universityId, published: true },
      select: { id: true },
    });
    for (const { id } of programs) {
      const program = (await loadProgram(id))!;
      const { complete, missing } = await checklist(program);
      if (program.requirementsComplete) {
        tally("requirementsComplete already set");
        continue;
      }
      if (!complete) {
        tally("left UNKNOWN (checklist)");
        for (const m of missing) tally("checklist gap: " + shape(m));
        continue;
      }
      tally("requirementsComplete set");
      console.log(`   COMPLETE ${universityId} | ${program.title}`);
      if (!apply) continue;
      await db.degreeProgram.update({
        where: { id },
        data: { requirementsComplete: true },
      });
      // ReviewRecord needs a candidate: attach to the programme's newest one when there is one.
      const latest = await db.extractionCandidate.findFirst({
        where: { programId: id },
        orderBy: { createdAt: "desc" },
      });
      if (latest)
        await db.reviewRecord.create({
          data: {
            candidateId: latest.id,
            action: "AUTO_COMPLETE",
            previousValue: { requirementsComplete: false },
            revisedValue: { requirementsComplete: true, checklist: "plan 3.2" },
            administratorIdentity: AUTO_REVIEWER,
          },
        });
    }
  }
  console.log("\n" + (apply ? "APPLIED" : "DRY RUN (APPLY=1 writes)"));
  for (const [key, n] of [...count].sort((a, b) => b[1] - a[1]))
    console.log(String(n).padStart(6), key);
} finally {
  await db.$disconnect();
}
